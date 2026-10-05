import type { TuiSelection } from "@zcode/tui";
import { getZCodeCopy } from "@zcode/i18n";

export function buildApiKeySelection(locale?: string): TuiSelection {
  const copy = getZCodeCopy(locale).tui.modelSetup;
  return {
    emptyMessage: copy.emptyMessage,
    filterable: false,
    help: copy.help,
    items: [
      {
        command: "/apikey zai-coding-plan-api-key",
        id: "zai-coding-plan-api-key",
        input: {
          cancelStatus: copy.input.cancelStatus,
          clearStatus: copy.input.clearStatus,
          emptyStatus: copy.input.emptyStatus,
          help: copy.input.help,
          mask: true,
          placeholder: copy.input.placeholder,
          primary: copy.options.zaiApiKey.inputPrimary,
          secondary: copy.options.zaiApiKey.inputSecondary,
          status: copy.input.status,
          submitStatus: copy.input.submitStatus,
        },
        keywords: ["zai", "api", "key", "manual"],
        primary: copy.options.zaiApiKey.primary,
        secondary: copy.options.zaiApiKey.secondary,
      },
      {
        command: "/apikey bigmodel-coding-plan-api-key",
        id: "bigmodel-coding-plan-api-key",
        input: {
          cancelStatus: copy.input.cancelStatus,
          clearStatus: copy.input.clearStatus,
          emptyStatus: copy.input.emptyStatus,
          help: copy.input.help,
          mask: true,
          placeholder: copy.input.placeholder,
          primary: copy.options.bigmodelApiKey.inputPrimary,
          secondary: copy.options.bigmodelApiKey.inputSecondary,
          status: copy.input.status,
          submitStatus: copy.input.submitStatus,
        },
        keywords: ["bigmodel", "api", "key", "manual"],
        primary: copy.options.bigmodelApiKey.primary,
        secondary: copy.options.bigmodelApiKey.secondary,
      },
    ],
    prompt: copy.prompt,
    title: copy.title,
  };
}

export function modelSetupResponse(locale?: string): string {
  return getZCodeCopy(locale).tui.modelSetup.response;
}

export function formatProviderSetupResult(result: {
  configPath: string;
  model: string;
  providerId: "bigmodel" | "zai";
}): string {
  const provider = result.providerId === "bigmodel" ? "BigModel" : "Z.AI";
  return [
    `Configured ${provider} Coding Plan.`,
    `Model: ${result.model}`,
    `Model selection: ${result.configPath}`,
  ].join("\n");
}

export function parseApiKeyArgs(args: string): {
  apiKey: string;
  kind: "bigmodel-coding-plan-api-key" | "zai-coding-plan-api-key";
  providerId: "bigmodel" | "zai";
} | null {
  const [kind, ...rest] = args.split(/\s+/u);
  if (kind !== "zai-coding-plan-api-key" && kind !== "bigmodel-coding-plan-api-key") {
    return null;
  }
  return {
    apiKey: rest.join(" ").trim(),
    kind,
    providerId: kind.startsWith("bigmodel") ? "bigmodel" : "zai",
  };
}
