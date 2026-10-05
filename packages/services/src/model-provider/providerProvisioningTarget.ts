/* eslint-disable max-lines -- Provisioning target keeps transaction and rollback invariants together. */
import {
  type PersonalProviderConfigRepository,
  type ProviderConfigLayerUpdate,
} from "@zcode/provider";
import { decodeProviderConfigFile, encodeProviderConfigFile } from "@zcode/provider-node";
import {
  providerProvisioningEnvelopeSchema,
  providerProvisioningResultSchema,
  type ProviderProvisioningEnvelope,
  type ProviderProvisioningResult,
} from "@zcode/shared";
import { atomicWritePrivateTextFile, withFileLock } from "@zcode/shared/node";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { IProviderProvisioningTargetService } from "./providerProvisioning.js";
import { readProvisionablePersonalConfig } from "./providerProvisioningSource.js";
import type { ProviderRuntime } from "./providerRuntime.js";

const PROVISIONING_SCHEMA_VERSION = 1 as const;

export interface ProviderProvisioningTargetOptions {
  readonly providerRuntime: ProviderRuntime;
  readonly personalRepository: PersonalProviderConfigRepository;
  readonly personalConfigFilePath: string;
  readonly stateFilePath: string;
}

interface ProvisioningStateRecord {
  readonly syncId: string;
  readonly result: ProviderProvisioningResult;
}

interface ProvisioningStateFile {
  readonly schemaVersion: typeof PROVISIONING_SCHEMA_VERSION;
  readonly records: readonly ProvisioningStateRecord[];
}

/** 运行在目标 Environment 内的 Provisioning target；负责写正式 Store 并在失败时回滚。 */
export function createProviderProvisioningTarget(
  options: ProviderProvisioningTargetOptions,
): IProviderProvisioningTargetService {
  return {
    async apply(input: ProviderProvisioningEnvelope): Promise<ProviderProvisioningResult> {
      const envelope = providerProvisioningEnvelopeSchema.parse(input);
      return withFileLock(options.stateFilePath, async () => {
        const previousState = await readStateFile(options.stateFilePath);
        const previous = previousState?.records.find((record) => record.syncId === envelope.syncId);
        if (previous) return { ...previous.result, status: "already-applied" };
        await options.providerRuntime.start();
        const before = await readProvisionablePersonalConfig(
          options.personalRepository,
          options.personalConfigFilePath,
        );
        const update = parsePersonalConfig(envelope);
        let applied = false;
        try {
          // 写入前登记；原子替换后的错误仍需进入回滚，同时防止覆盖其他同步写入。
          applied = true;
          await options.personalRepository.update((current) => {
            if (!samePersonalConfig(current, before))
              throw new Error("Personal Provider Config 在同步期间被其他操作修改");
            return update;
          });
          const snapshot =
            await options.providerRuntime.registryService.refresh("provider-provisioning");
          if (
            update.defaultModelSelection &&
            !options.providerRuntime.registryService.validateSelection(update.defaultModelSelection)
              .ok
          )
            throw new Error("同步后的 Registry 不支持默认模型");
          const result: ProviderProvisioningResult = {
            syncId: envelope.syncId,
            status: "applied",
            personalProviderCount: update.providers.keys().length,
            configRevision: snapshot.sourceRevisions.config,
            rolledBack: false,
          };
          await writeStateFile(options.stateFilePath, appendStateRecord(previousState, result));
          return result;
        } catch (error) {
          let rollbackError: unknown;
          if (applied) {
            try {
              await options.personalRepository.update((current) => {
                if (samePersonalConfig(current, before)) return current;
                if (!samePersonalConfig(current, update))
                  throw new Error("Personal Provider Config 已被其他操作修改，不能回滚");
                return before;
              });
              await options.providerRuntime.registryService.refresh(
                "provider-provisioning-rollback",
              );
            } catch (cause) {
              rollbackError = cause;
            }
          }
          return {
            syncId: envelope.syncId,
            status: rollbackError ? "rollback_failed" : "failed",
            personalProviderCount: before.providers.keys().length,
            errorMessage:
              formatError(error) +
              (rollbackError ? "；回滚失败：" + formatError(rollbackError) : ""),
            rolledBack: !rollbackError,
          };
        }
      });
    },
  };
}

function parsePersonalConfig(envelope: ProviderProvisioningEnvelope): ProviderConfigLayerUpdate {
  // 信封与本地保存复用正式 Personal codec，不在接收端另建字段清单或模式判断。
  return decodeProviderConfigFile({ schemaVersion: 1, config: envelope.personalConfig });
}

function samePersonalConfig(
  left: ProviderConfigLayerUpdate,
  right: ProviderConfigLayerUpdate,
): boolean {
  return (
    JSON.stringify(encodeProviderConfigFile(left)) ===
    JSON.stringify(encodeProviderConfigFile(right))
  );
}

async function readStateFile(filePath: string): Promise<ProvisioningStateFile | null> {
  try {
    return z
      .object({
        schemaVersion: z.literal(PROVISIONING_SCHEMA_VERSION),
        records: z.array(
          z.object({
            syncId: z.string().trim().min(1),
            result: providerProvisioningResultSchema,
          }),
        ),
      })
      .parse(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if (isFileNotFound(error)) return null;
    // 损坏的幂等记录不能被当成首次同步，否则可能重复覆盖个人配置。
    throw error;
  }
}

function appendStateRecord(
  previousState: ProvisioningStateFile | null,
  result: ProviderProvisioningResult,
): ProvisioningStateFile {
  const records = [
    ...(previousState?.records ?? []).filter((record) => record.syncId !== result.syncId),
    { syncId: result.syncId, result },
  ];
  return {
    schemaVersion: PROVISIONING_SCHEMA_VERSION,
    records,
  };
}

function writeStateFile(filePath: string, state: ProvisioningStateFile): Promise<void> {
  return atomicWritePrivateTextFile(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
