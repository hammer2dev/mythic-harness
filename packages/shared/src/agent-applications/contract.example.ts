import type { IAgentApplicationsService } from "./contract.js";

export function readLocalAgentApplications(service: IAgentApplicationsService) {
  return service.list(true);
}
