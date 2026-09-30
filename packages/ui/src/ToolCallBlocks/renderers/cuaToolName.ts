/** 识别旧会话中的 Computer Use 工具，保留历史结果的专属渲染。 */
export function isZCodeCuaToolName(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase().replace(/_/g, "-") ?? "";
  return normalized.includes("computer-use");
}
