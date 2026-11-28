export type AgentApplicationProtocol = "codex" | "claude" | "acp";
export type AgentApplicationSource = "npm" | "native";

export interface AgentApplicationModel {
  id: string;
  name: string;
}

export interface AgentApplicationModelView extends AgentApplicationModel {
  selected: boolean;
  enabled: boolean;
  available: boolean;
}

export interface AgentApplicationTest {
  at: number;
  modelId: string;
  modelName: string;
  elapsedMs: number;
  passed: boolean;
  reply?: string;
  error?: string;
}

export interface AgentApplicationView {
  id: string;
  name: string;
  vendor: string;
  protocol: AgentApplicationProtocol;
  custom: boolean;
  configured: boolean;
  attached: boolean;
  installed: boolean;
  enabled: boolean;
  path: string;
  args: readonly string[];
  source: AgentApplicationSource | null;
  version: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  models: readonly AgentApplicationModelView[];
  test: AgentApplicationTest | null;
  history: readonly AgentApplicationTest[];
}

export interface AgentApplicationProgramInput {
  /** 缺少 ID 时登记自定义 ACP。 */
  id?: string;
  name?: string;
  path: string;
  args?: readonly string[];
}

export interface AgentApplicationTestResult {
  result: AgentApplicationTest;
  application: AgentApplicationView;
}

export const AGENT_APPLICATION_TEST_PROMPT = "请只回复 OK。";

export interface IAgentApplicationsService {
  /** 读取本机目录。扫描时刷新已检测版本和发布版本。 */
  list(scan?: boolean): Promise<readonly AgentApplicationView[]>;
  saveProgram(input: AgentApplicationProgramInput): Promise<AgentApplicationView>;
  setEnabled(id: string, enabled: boolean): Promise<AgentApplicationView>;
  readModels(id: string): Promise<AgentApplicationView>;
  setModelEnabled(id: string, modelId: string, enabled: boolean): Promise<AgentApplicationView>;
  /** 只测试当前可选的已启用模型，结果摘要落盘后返回。 */
  test(id: string, modelId: string): Promise<AgentApplicationTestResult>;
  cancelTest(id: string): Promise<void>;
  upgrade(id: string, version: string): Promise<AgentApplicationView>;
  uninstall(id: string): Promise<AgentApplicationView>;
  remove(id: string): Promise<void>;
}
