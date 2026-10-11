import { relative } from "node:path";
import { ApplyPatchInputSchema } from "@zcode/contracts";
import { wildcardToRegExp } from "../../permission/rule-matching.js";
import type { ToolPermissionRulePolicy, ToolRuntimePermissionCapabilityContext } from "../types.js";
import { parseApplyPatch } from "./apply-patch-parser.js";
import { resolvePatchPaths } from "./apply-patch-plan.js";

export function resolveApplyPatchPermissionRulePolicy(
  input: unknown,
  context?: ToolRuntimePermissionCapabilityContext,
): ToolPermissionRulePolicy {
  let targets: string[][] = [];
  try {
    const operations = parseApplyPatch(ApplyPatchInputSchema.parse(input).patch_text);
    if (context?.workingDirectory && context.workspaceRoot) {
      targets = resolvePatchPaths(operations, {
        workingDirectory: context.workingDirectory,
        workspaceRoot: context.workspaceRoot,
      })
        .flatMap((operation) => [
          operation.path,
          ...(operation.movePath ? [operation.movePath] : []),
        ])
        .map((path) => [normalize(path), normalize(relative(context.workingDirectory!, path))]);
    }
  } catch {
    // 非法补丁不能用未经解析的 patch_text 匹配路径规则；handler 会报告具体语法错误。
  }
  return {
    evaluateRules(behavior, rules) {
      if (!targets.length) return behavior !== "allow" && rules.some((rule) => !rule.ruleContent);
      const matches = (subjects: string[]) =>
        rules.some(
          (rule) =>
            !rule.ruleContent ||
            subjects.some((subject) =>
              wildcardToRegExp(normalize(rule.ruleContent!)).test(subject),
            ),
        );
      return behavior === "allow" ? targets.every(matches) : targets.some(matches);
    },
    suggestedPermissionUpdates: targets.length
      ? [
          {
            type: "addRules",
            behavior: "allow",
            rules: targets.map(([absolute]) => ({
              toolName: "ApplyPatch",
              ruleContent: absolute!,
            })),
          },
        ]
      : [],
  };
}

function normalize(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
