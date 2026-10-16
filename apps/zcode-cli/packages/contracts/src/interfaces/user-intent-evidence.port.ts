import type { TurnId } from "./shared.js";

/** 由真实交互 broker 构造，不从模型输入或 hook 结果读取。 */
export interface TrustedUserAnswer {
  question: string;
  answer: string;
  selectedOption?: { label: string; description: string };
}

export interface JdkChangeIntent {
  turnId: TurnId;
  path?: string;
  operation: "register" | "select" | "clearSelection" | "forget";
  scope: "environment" | "project";
  purpose?: "project" | "build";
}

/** handler 只能查询，不得向本轮真实用户证据追加内容。 */
export interface UserIntentEvidencePort {
  allowsJdkChange(input: JdkChangeIntent): boolean;
}
