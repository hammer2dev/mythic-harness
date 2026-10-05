import type { ApiClient } from "@zcode/shared";
import { readApiJson } from "../providers/api/apiJson.js";
import { ZCODE_CLIENT_SCENES_URL } from "../providers/api/apiEndpoints.js";
import type { ClientScenesResponse, IClientScenesService } from "./clientScenes.js";

export function createClientScenesService(dependencies: {
  apiClient: ApiClient;
}): IClientScenesService {
  return {
    async list() {
      const response = await readApiJson<ClientScenesResponse>(
        dependencies.apiClient,
        ZCODE_CLIENT_SCENES_URL,
        {
          method: "GET",
          credentials: "omit",
        },
      );
      if (response.code !== 0) return response;
      return {
        ...response,
        data: response.data.map((scene) => ({
          ...scene,
          options: Object.fromEntries(
            Object.entries(scene.options).map(([key, option]) => [
              key,
              {
                ...option,
                ...(option.items
                  ? {
                      items: option.items.filter(
                        (item) =>
                          !item.on_finish
                            ?.split(",")
                            .some((action) => action.trim() === "NAVIGATE:AUTOMATIONS:OFFPEAK"),
                      ),
                    }
                  : {}),
              },
            ]),
          ),
        })),
      };
    },
  };
}
