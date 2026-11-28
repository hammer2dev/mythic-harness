import type { IAgentApplicationsService } from "./contract.js";

export async function exampleAgentApplications(service: IAgentApplicationsService) {
  const app = await service.saveProgram({ id: "codex", path: "" });
  const { models } = await service.readModels(app.id);
  const model = models.find(({ available }) => available);
  if (!model) return;
  await service.setModelEnabled(app.id, model.id, true);
  return service.test(app.id, model.id);
}
