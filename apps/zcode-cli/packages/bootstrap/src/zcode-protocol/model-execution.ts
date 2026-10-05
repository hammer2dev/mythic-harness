import type { CommandPayloadMap } from "@zcode/shared/zcode-protocol-v4";
import type { SendInputOptions } from "../app/types.js";
export function createModelExecutionContext(
  input: NonNullable<CommandPayloadMap["sendText"]["modelExecution"]>,
): NonNullable<SendInputOptions["modelExecution"]> {
  return {
    selectionScope: "execution",
    ...(input.memoryExtraction ? { memoryExtraction: input.memoryExtraction } : {}),
    ...(input.subagents ? { subagents: input.subagents } : {}),
  };
}
