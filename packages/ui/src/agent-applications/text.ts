import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function useAgentAppText() {
  const { intl } = useZCodeIntl();
  return (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `agentApplications.${key}` }, values);
}

const errors: Record<string, string> = {
  "The Agent application configuration could not be read.": "storage",
  "The configured Agent program was not found.": "missing",
  "Choose an existing program using an absolute path.": "path",
  "Enter an application name.": "name",
  "An action is already running for this Agent.": "busy",
  "The Agent did not provide a model list.": "noModels",
  "The selected model is unavailable. Read the model list again.": "model",
  "The Agent could not use the selected model. Read the model list again.": "model",
  "The Agent request timed out.": "timeout",
  "The operation was aborted due to timeout": "timeout",
  "The Agent exited before completing the request.": "exited",
  "The Agent did not return a reply.": "noReply",
  "Sign in to the Agent with its own login and try again.": "login",
  "Use the program's original installation channel for this action.": "originalChannel",
  "Node.js and npm are required to maintain this installation.": "npmMissing",
  "The program is in use. Close it and try again.": "inUse",
  "npm failed. Check the npm configuration and try again.": "npm",
  "Refresh the application list to check the latest version.": "version",
  "The requested version could not be verified.": "verifyVersion",
  "The program is still installed. Check the npm result.": "uninstall",
};

export function useAgentAppError(message: string | null) {
  const t = useAgentAppText();
  if (message === null) return null;
  return t(`error.${errors[message] ?? "general"}`);
}
