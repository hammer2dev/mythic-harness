import { randomUUID } from "node:crypto";
import { isAbsolute, normalize } from "node:path";
import { gt, valid } from "semver";
import { getAppConfigDir } from "#src/paths.js";
import { BUILTIN_APPLICATIONS, builtinApplication, type ApplicationDescriptor } from "./catalog.js";
import type {
  AgentApplicationModel,
  AgentApplicationModelView,
  AgentApplicationTest,
  AgentApplicationView,
  IAgentApplicationsService,
} from "./contract.js";
import {
  changeNpmInstallation,
  discoverProgram,
  inspectVersion,
  locateProgram,
  type LocalProgram,
} from "./programs.js";
import {
  AgentApplicationsRepo,
  applicationIdSchema,
  programInputSchema,
  type ApplicationRecord,
} from "./repository.js";
import { runApplication } from "./runtime.js";

const LIMIT = { probe: 8000, models: 45_000, test: 120_000, npm: 180_000 };
type Operation = {
  controller: AbortController;
  kind: "test" | "change";
  completion: Promise<unknown>;
};

function descriptor(id: string, record?: ApplicationRecord): ApplicationDescriptor {
  const builtin = builtinApplication(id);
  if (builtin) return builtin;
  if (!record) throw new Error("The Agent application was not found.");
  return { id, name: record.name, vendor: "", protocol: "acp", args: record.args };
}

function newer(current: string | null, latest: string | null): boolean {
  return Boolean(current && latest && valid(current) && valid(latest) && gt(latest, current));
}

function sameVersion(record: ApplicationRecord, program: LocalProgram): boolean {
  return program.version === null || record.version === program.version;
}

function assignProgram(record: ApplicationRecord, program: LocalProgram | null): ApplicationRecord {
  return {
    ...record,
    path: program?.path ?? "",
    source: program?.source ?? null,
    version: program?.version ?? null,
    candidates: [],
    test: null,
  };
}

function modelsFor(record: ApplicationRecord, available: boolean): AgentApplicationModelView[] {
  const candidates = available ? record.candidates : [];
  const selected = new Map(record.models.map((model) => [model.id, model]));
  return [
    ...candidates.map((model) => ({
      ...model,
      available: true,
      selected: selected.has(model.id),
      enabled: selected.get(model.id)?.enabled ?? false,
    })),
    ...record.models
      .filter((model) => !candidates.some(({ id }) => id === model.id))
      .map((model) => ({ ...model, available: false, selected: true })),
  ];
}

function uniqueModels(models: AgentApplicationModel[]): AgentApplicationModel[] {
  return [
    ...new Map(
      models.filter(({ id, name }) => id && name).map((model) => [model.id, model]),
    ).values(),
  ];
}

/** 保存能指引用户处理的摘要，避免把 Agent stderr 或服务响应中的登录资料落盘。 */
function testError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/sign in|not logged|authenticat|unauthori[sz]ed|invalid api key|\b401\b/i.test(message))
    return "Sign in to the Agent with its own login and try again.";
  if (/timed out|timeout/i.test(message)) return "The Agent request timed out.";
  if (/unavailable.*read the model|did not select|selected model|protocol version/i.test(message))
    return "The Agent could not use the selected model. Read the model list again.";
  if (/did not return/.test(message)) return "The Agent did not return a reply.";
  if (/before completing|could not be started|did not complete/.test(message))
    return "The Agent exited before completing the request.";
  return "The Agent request failed. Check the program in its own terminal and try again.";
}

async function lookupLatest(app: ApplicationDescriptor): Promise<string | null> {
  if (!app.packageName) return null;
  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(app.packageName)}/latest`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (
      typeof data !== "object" ||
      !data ||
      !("version" in data) ||
      typeof data.version !== "string"
    )
      return null;
    return valid(data.version);
  } catch {
    return null;
  }
}

export function createAgentApplications(directory = getAppConfigDir()): {
  service: IAgentApplicationsService;
  dispose(): Promise<void>;
} {
  const repo = new AgentApplicationsRepo(directory);
  const latestVersions = new Map<string, string>();
  const operations = new Map<string, Operation>();
  let disposed = false;

  async function getRecord(id: string): Promise<ApplicationRecord | undefined> {
    return (await repo.read()).find((item) => item.id === id);
  }

  async function requireRecord(id: string): Promise<ApplicationRecord> {
    const record = await getRecord(id);
    if (!record) throw new Error("Connect the Agent application first.");
    return record;
  }

  async function toView(
    app: ApplicationDescriptor,
    record: ApplicationRecord | undefined,
    scan = false,
  ): Promise<AgentApplicationView> {
    const program = record?.path
      ? await locateProgram(app, record.path)
      : await discoverProgram(app);
    const latestVersion = latestVersions.get(app.id) ?? null;
    const version = program
      ? scan
        ? await inspectVersion(
            program,
            AbortSignal.timeout(LIMIT.probe),
            !app.command ? app.args : [],
          )
        : (program.version ?? record?.version ?? null)
      : null;
    const current = Boolean(record?.path && program && (!version || version === record.version));
    return {
      id: app.id,
      name: app.name,
      vendor: app.vendor,
      protocol: app.protocol,
      custom: !app.command,
      configured: Boolean(record),
      attached: Boolean(record?.path),
      installed: Boolean(program),
      enabled: record?.enabled ?? false,
      path: record?.path || program?.path || "",
      args: record?.args ?? [],
      source: program?.source ?? null,
      version,
      latestVersion,
      updateAvailable: newer(version, latestVersion),
      models: record ? modelsFor(record, current) : [],
      test: current ? (record?.test ?? null) : null,
      history: record?.history ?? [],
    };
  }

  async function findVersionedProgram(
    app: ApplicationDescriptor,
    path: string,
    signal: AbortSignal,
  ) {
    const program = await locateProgram(app, path);
    if (!program) return null;
    const version = await inspectVersion(program, signal, !app.command ? app.args : []);
    signal.throwIfAborted();
    return { ...program, version };
  }

  async function getProgram(app: ApplicationDescriptor, path: string, signal: AbortSignal) {
    const program = await findVersionedProgram(app, path, signal);
    if (!program) throw new Error("The configured Agent program was not found.");
    return program;
  }

  function operate<T>(
    id: string,
    kind: Operation["kind"],
    budget: number,
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    applicationIdSchema.parse(id);
    if (disposed) return Promise.reject(new Error("The Agent application service closed."));
    if (operations.has(id))
      return Promise.reject(new Error("An action is already running for this Agent."));
    const controller = new AbortController();
    const completion = repo
      .withApplicationLock(id, async () => {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(budget)]);
        signal.throwIfAborted();
        return action(signal);
      })
      .finally(() => operations.delete(id));
    operations.set(id, { controller, kind, completion });
    return completion;
  }

  const service: IAgentApplicationsService = {
    async list(scan = false) {
      const records = await repo.read();
      const configured = new Map(records.map((record) => [record.id, record]));
      if (scan || latestVersions.size === 0) {
        await Promise.all(
          BUILTIN_APPLICATIONS.map(async (app) => {
            const version = await lookupLatest(app);
            if (version) latestVersions.set(app.id, version);
          }),
        );
      }
      const apps = [
        ...BUILTIN_APPLICATIONS,
        ...records
          .filter((record) => !builtinApplication(record.id))
          .map((record) => descriptor(record.id, record)),
      ];
      return Promise.all(
        apps.map((app) => toView(app, configured.get(app.id), scan || !configured.get(app.id))),
      );
    },

    async saveProgram(input) {
      const values = programInputSchema.parse(input);
      const id = values.id ?? `custom-${randomUUID()}`;
      return operate(id, "change", LIMIT.probe, async (signal) => {
        const previous = await getRecord(id);
        if (values.id && !builtinApplication(id) && !previous)
          throw new Error("The Agent application was not found.");
        const record: ApplicationRecord = previous ?? {
          id,
          name: builtinApplication(id)?.name ?? values.name ?? "",
          path: "",
          args: [],
          enabled: false,
          source: null,
          version: null,
          models: [],
          candidates: [],
          test: null,
          history: [],
        };
        const app = descriptor(id, record);
        const name = app.command ? app.name : (values.name ?? record.name);
        if (!name) throw new Error("Enter an application name.");
        const args = app.command ? [] : (values.args ?? record.args);
        const path = values.path.trim() || (await discoverProgram(app))?.path || "";
        if (!isAbsolute(path))
          throw new Error("Choose an existing program using an absolute path.");
        const program = await getProgram({ ...app, args }, normalize(path), signal);
        const changed =
          record.path !== program.path ||
          record.version !== program.version ||
          JSON.stringify(record.args) !== JSON.stringify(args);
        const next = { ...(changed ? assignProgram(record, program) : record), name, args };
        await repo.write(id, next);
        return toView(descriptor(id, next), next);
      });
    },

    setEnabled(id, enabled) {
      return operate(id, "change", LIMIT.probe, async (signal) => {
        if (typeof enabled !== "boolean") throw new Error("Invalid enable state.");
        const record = await requireRecord(id);
        const app = descriptor(id, record);
        const program = await findVersionedProgram(app, record.path, signal);
        if (enabled && !program) throw new Error("The configured Agent program was not found.");
        const current =
          program && !sameVersion(record, program) ? assignProgram(record, program) : record;
        const next = { ...current, enabled };
        await repo.write(id, next);
        return toView(app, next);
      });
    },

    readModels(id) {
      return operate(id, "change", LIMIT.models, async (signal) => {
        const record = await requireRecord(id);
        const app = descriptor(id, record);
        const program = await getProgram(app, record.path, signal);
        const result = await runApplication(app, program, signal).catch((error) => {
          if (signal.aborted) throw signal.reason;
          throw new Error(testError(error));
        });
        const candidates = "models" in result ? uniqueModels(result.models) : [];
        if (candidates.length === 0) throw new Error("The Agent did not provide a model list.");
        signal.throwIfAborted();
        const next = {
          ...(sameVersion(record, program) ? record : assignProgram(record, program)),
          candidates,
          models: record.models.map((model) => ({
            ...model,
            name: candidates.find(({ id }) => id === model.id)?.name ?? model.name,
          })),
        };
        await repo.write(id, next);
        return toView(app, next);
      });
    },

    setModelEnabled(id, modelId, enabled) {
      return operate(id, "change", LIMIT.probe, async (signal) => {
        if (typeof enabled !== "boolean") throw new Error("Invalid enable state.");
        const record = await requireRecord(id);
        const app = descriptor(id, record);
        const program = await findVersionedProgram(app, record.path, signal);
        const current =
          program && !sameVersion(record, program) ? assignProgram(record, program) : record;
        const selected = current.models.find((model) => model.id === modelId);
        const candidate = current.candidates.find((model) => model.id === modelId);
        if (enabled && (!program || !candidate))
          throw new Error("The selected model is unavailable. Read the model list again.");
        const models = selected
          ? current.models.map((model) => (model.id === modelId ? { ...model, enabled } : model))
          : enabled && candidate
            ? [...current.models, { ...candidate, enabled }]
            : current.models;
        const next = { ...current, models };
        await repo.write(id, next);
        return toView(app, next);
      });
    },

    test(id, modelId) {
      return operate(id, "test", LIMIT.test, async (signal) => {
        const record = await requireRecord(id);
        const app = descriptor(id, record);
        const program = await getProgram(app, record.path, signal);
        const model = modelsFor(record, sameVersion(record, program)).find(
          (item) => item.id === modelId && item.enabled && item.available,
        );
        if (!model)
          throw new Error("The selected model is unavailable. Read the model list again.");
        const at = Date.now();
        let reply = "";
        let error: string | undefined;
        try {
          const result = await runApplication(app, program, signal, modelId);
          signal.throwIfAborted();
          reply = "reply" in result ? result.reply.trim().slice(0, 4000) : "";
          if (!reply) throw new Error("The Agent did not return a reply.");
        } catch (cause) {
          if (signal.reason?.name === "AbortError") throw signal.reason;
          error = testError(cause);
        }
        const result: AgentApplicationTest = {
          at,
          elapsedMs: Date.now() - at,
          modelId,
          modelName: model.name,
          passed: !error,
          ...(error ? { error } : { reply }),
        };
        const next = { ...record, test: result, history: [result, ...record.history].slice(0, 20) };
        await repo.write(id, next);
        return { result, application: await toView(app, next) };
      });
    },

    async cancelTest(id) {
      const operation = operations.get(id);
      if (operation?.kind === "test")
        operation.controller.abort(new DOMException("The test was cancelled.", "AbortError"));
    },

    upgrade(id, version) {
      return operate(id, "change", LIMIT.npm, async (signal) => {
        const record = await getRecord(id);
        const app = descriptor(id, record);
        const program = record?.path
          ? await getProgram(app, record.path, signal)
          : await discoverProgram(app);
        if (!program) throw new Error("The configured Agent program was not found.");
        const current = program.version ?? (await inspectVersion(program, signal));
        if (version !== latestVersions.get(id) || !newer(current, version))
          throw new Error("Refresh the application list to check the latest version.");
        await changeNpmInstallation(app, program, version, signal);
        const installed = await getProgram(app, program.path, signal);
        if (installed.version !== version)
          throw new Error("The requested version could not be verified.");
        const next = record ? assignProgram(record, installed) : undefined;
        if (next) await repo.write(id, next);
        return toView(app, next, !next);
      });
    },

    uninstall(id) {
      return operate(id, "change", LIMIT.npm, async (signal) => {
        const record = await requireRecord(id);
        const app = descriptor(id, record);
        const program = await getProgram(app, record.path, signal);
        await changeNpmInstallation(app, program, null, signal);
        if (await locateProgram(app, program.path))
          throw new Error("The program is still installed. Check the npm result.");
        const next = { ...assignProgram(record, null), enabled: false };
        await repo.write(id, next);
        return toView(app, next);
      });
    },

    remove(id) {
      return operate(id, "change", LIMIT.probe, async () => {
        await repo.write(id, null);
      });
    },
  };
  return {
    service,
    async dispose() {
      disposed = true;
      const pending = [...operations.values()];
      for (const { controller } of pending)
        controller.abort(new DOMException("The Agent application service closed.", "AbortError"));
      await Promise.allSettled(pending.map(({ completion }) => completion));
    },
  };
}
