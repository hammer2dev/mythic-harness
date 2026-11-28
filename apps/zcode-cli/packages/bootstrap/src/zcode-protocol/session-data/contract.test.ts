import { describe, expect, it } from "vitest";
import { cliSessionDataModule } from "./module.js";

// 归档会话的执行行为由 packages/bootstrap/tests/session-permanent-deletion.test.ts 覆盖。
describe("cli-session-data contract", () => {
  it("declares its module manifest", () => {
    expect(cliSessionDataModule.id).toBe("cli-session-data");
  });
});
