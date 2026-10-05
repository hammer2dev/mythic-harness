import type { IUsageStatsService } from "./usageStats.js";
import type { IZCodeAgentService } from "../zcode-agent/zcodeAgent.js";

/** 应用统计只读取执行数据库中的 usage/stats，不查询供应商账号额度。 */
export function createUsageStatsService(dependencies: {
  zcodeAgentService: Pick<IZCodeAgentService, "getAppUsageStats">;
}): IUsageStatsService {
  return {
    getAppUsageSnapshot: (request) =>
      dependencies.zcodeAgentService.getAppUsageStats({
        range: request.range,
        timeZone: request.timeZone,
      }),
  };
}
