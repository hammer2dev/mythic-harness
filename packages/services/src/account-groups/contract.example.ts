import type { IAccountGroupsService } from "./contract.js";

export async function createExampleAccountGroup(service: IAccountGroupsService) {
  const { id } = await service.saveGroup({ name: "Example", description: "" });
  return service.saveEntry({
    groupId: id,
    name: "Example database",
    description: "",
    type: "database",
    fields: [{ name: "Host", value: "db.example.test" }],
  });
}
