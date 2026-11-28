import type { AgentApplicationProtocol } from "./contract.js";

export interface ApplicationDescriptor {
  id: string;
  name: string;
  vendor: string;
  protocol: AgentApplicationProtocol;
  command?: string;
  packageName?: string;
  args: readonly string[];
}

export const BUILTIN_APPLICATIONS: readonly ApplicationDescriptor[] = [
  {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    protocol: "codex",
    command: "codex",
    packageName: "@openai/codex",
    args: ["app-server", "--listen", "stdio://"],
  },
  {
    id: "claude",
    name: "Claude Agent",
    vendor: "Anthropic",
    protocol: "claude",
    command: "claude",
    packageName: "@anthropic-ai/claude-code",
    args: [],
  },
  {
    id: "kimi",
    name: "Kimi Code",
    vendor: "Moonshot AI",
    protocol: "acp",
    command: "kimi",
    packageName: "@moonshot-ai/kimi-code",
    args: ["acp"],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    vendor: "Google",
    protocol: "acp",
    command: "gemini",
    packageName: "@google/gemini-cli",
    args: ["--acp"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    vendor: "OpenCode",
    protocol: "acp",
    command: "opencode",
    packageName: "opencode-ai",
    args: ["acp"],
  },
];

export function builtinApplication(id: string): ApplicationDescriptor | undefined {
  return BUILTIN_APPLICATIONS.find((app) => app.id === id);
}
