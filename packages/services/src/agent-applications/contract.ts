import { ServiceChannels } from "@zcode/shared";
import type { IAgentApplicationsService as AgentApplicationsService } from "@zcode/shared/agent-applications";
import { createServiceDescriptor } from "#src/descriptors.js";

export * from "@zcode/shared/agent-applications";

export type IAgentApplicationsService = AgentApplicationsService;
export const IAgentApplicationsService = createServiceDescriptor<AgentApplicationsService>(
  ServiceChannels.AgentApplications,
);
