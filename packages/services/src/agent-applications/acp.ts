import { Readable, Writable } from "node:stream";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { NewSessionResponse } from "@agentclientprotocol/sdk";
import { AGENT_APPLICATION_TEST_PROMPT } from "./contract.js";
import { withApplicationProcess } from "./local-process.js";
import type { LocalProgram } from "./programs.js";
import type { ApplicationRuntimeResult } from "./runtime-types.js";

function sessionModels(session: NewSessionResponse) {
  const config = session.configOptions?.find(
    (option) => option.type === "select" && (option.category === "model" || option.id === "model"),
  );
  if (config?.type === "select") {
    const options = config.options.flatMap((option) =>
      "options" in option ? option.options : [option],
    );
    return {
      configId: config.id,
      current: config.currentValue,
      models: options.map(({ value, name }) => ({ id: value, name })),
    };
  }
  return {
    configId: undefined,
    current: session.models?.currentModelId,
    models:
      session.models?.availableModels.map(({ modelId, name }) => ({ id: modelId, name })) ?? [],
  };
}

export function runAcp(
  program: LocalProgram,
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
  modelId?: string,
): Promise<ApplicationRuntimeResult> {
  return withApplicationProcess(
    program.file,
    [...program.args, ...args],
    cwd,
    signal,
    async (child) => {
      let sessionId: string | undefined;
      let reply = "";
      const stream = ndJsonStream(
        Writable.toWeb(child.stdin) as unknown as Parameters<typeof ndJsonStream>[0],
        Readable.toWeb(child.stdout) as unknown as Parameters<typeof ndJsonStream>[1],
      );
      const connection = new ClientSideConnection(
        () => ({
          requestPermission: async () => ({ outcome: { outcome: "cancelled" } }),
          sessionUpdate: async (event) => {
            const { update } = event;
            if (
              event.sessionId === sessionId &&
              update.sessionUpdate === "agent_message_chunk" &&
              update.content.type === "text" &&
              reply.length < 4000
            ) {
              reply += update.content.text.slice(0, 4000 - reply.length);
            }
          },
        }),
        stream,
      );
      const initialized = await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: "mythic-harness", version: "1.0.0" },
      });
      if (initialized.protocolVersion !== PROTOCOL_VERSION)
        throw new Error("The Agent uses an unsupported ACP protocol version.");
      const session = await connection.newSession({ cwd, mcpServers: [] });
      sessionId = session.sessionId;
      const { configId, current, models } = sessionModels(session);
      if (!modelId) return { models };
      if (!models.some((model) => model.id === modelId))
        throw new Error("The selected model is unavailable. Read the model list again.");
      if (modelId !== current) {
        if (configId) {
          const updated = await connection.setSessionConfigOption({
            sessionId,
            configId,
            value: modelId,
          });
          const selected = updated.configOptions.find((option) => option.id === configId);
          if (selected?.type !== "select" || selected.currentValue !== modelId)
            throw new Error("The Agent did not select the requested model.");
        } else {
          await connection.unstable_setSessionModel({ sessionId, modelId });
        }
      }
      const result = await connection.prompt({
        sessionId,
        prompt: [{ type: "text", text: AGENT_APPLICATION_TEST_PROMPT }],
      });
      if (result.stopReason !== "end_turn") throw new Error("The Agent did not complete the test.");
      return { reply };
    },
  );
}
