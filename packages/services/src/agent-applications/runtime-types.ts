import type { AgentApplicationModel } from "./contract.js";

export type ApplicationRuntimeResult = { models: AgentApplicationModel[] } | { reply: string };
