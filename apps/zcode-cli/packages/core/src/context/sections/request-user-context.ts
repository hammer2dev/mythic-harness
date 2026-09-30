// ============================================================
// Request User Context Section Builder
// ============================================================

import type { ZCodeProjectWorkspace } from "@zcode/shared";
import { join } from "node:path";

import { formatProjectMemoryIndexContent } from "../../memory/index-content.js";
import type {
  ContextSection,
  ResolvedUserInstructionSource,
  ResolvedUserInstructions,
} from "../types.js";
import { estimateTokens } from "../utils.js";

export function buildRequestUserContextSection(input: {
  userInstructions?: ResolvedUserInstructions;
  projectWorkspace?: ZCodeProjectWorkspace;
  memoryIndexContent?: string;
  memoryRoot?: string;
}): ContextSection | null {
  const content = buildRequestUserContextContent(input);
  if (!content) {
    return null;
  }

  return {
    name: "Request User Context",
    source: "request_user_context",
    injectionTarget: "meta_user",
    cacheHint: "dynamic",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}

function buildRequestUserContextContent(input: {
  userInstructions?: ResolvedUserInstructions;
  projectWorkspace?: ZCodeProjectWorkspace;
  memoryIndexContent?: string;
  memoryRoot?: string;
}): string | null {
  const sections: string[] = [];
  if (input.projectWorkspace) {
    sections.push(
      [
        "# Project source folders",
        "The user has associated these folders with the project. You may read and modify files in all of them, subject to the existing tool permissions.",
        "The primary directory is the default for new sessions; it does not change the current session working directory. Use explicit paths when working in other folders.",
        "Treat each folder as a separate repository when using Git. Folder instructions apply only within their declared directory scope. Read nested AGENTS.md instructions before editing those files.",
        JSON.stringify(input.projectWorkspace, null, 2),
      ].join("\n"),
    );
  }

  const instructionContent = input.userInstructions
    ? buildInstructionContent(input.userInstructions)
    : null;
  if (instructionContent) {
    sections.push(instructionContent);
  }

  const memoryIndexContent = buildProjectMemoryIndexContent(
    input.memoryRoot,
    input.memoryIndexContent,
  );
  if (memoryIndexContent) {
    sections.push(memoryIndexContent);
  }

  if (sections.length === 0) {
    return null;
  }

  return [
    // 聚合字段标题不能绑定到 AGENTS.md，否则仅有 Project Memory 时缺少标题。

    "# agentsMd",
    "Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

function buildProjectMemoryIndexContent(
  memoryRoot: string | undefined,
  indexContent: string | undefined,
): string | null {
  if (!memoryRoot || indexContent === undefined) return null;
  const formatted = formatProjectMemoryIndexContent(indexContent);
  if (!formatted) return null;

  return [
    `Contents of ${join(memoryRoot, "MEMORY.md")} (user's auto-memory, persists across conversations):`,
    "",
    formatted,
  ].join("\n");
}

function buildInstructionContent(instructions: ResolvedUserInstructions): string | null {
  const sections = normalizedInstructionSources(instructions)
    .map((source) => buildInstructionSourceContent(source))
    .filter((content): content is string => content !== null);

  return sections.length > 0 ? sections.join("\n\n") : null;
}

function normalizedInstructionSources(
  instructions: ResolvedUserInstructions,
): ResolvedUserInstructionSource[] {
  if (instructions.sources && instructions.sources.length > 0) {
    return instructions.sources;
  }

  return [
    {
      scope: "workspace",
      filePath: instructions.filePath,
      fileName: instructions.fileName,
      content: instructions.content,
      bytesRead: instructions.bytesRead,
      sizeBytes: instructions.sizeBytes,
      truncated: instructions.truncated,
    },
  ];
}

function buildInstructionSourceContent(source: ResolvedUserInstructionSource): string | null {
  const body = source.truncated
    ? `${source.content}\n\n[File truncated: ${source.fileName}]`
    : source.content;
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return null;
  }

  return [
    `Contents of ${source.filePath} (${formatInstructionSourceScope(source.scope)}):`,
    ...(source.scopeDirectory
      ? [
          `Applies only within this directory and its descendants: ${JSON.stringify(source.scopeDirectory)}.`,
        ]
      : []),
    "",
    trimmedBody,
  ].join("\n");
}

function formatInstructionSourceScope(scope: ResolvedUserInstructionSource["scope"]): string {
  return scope === "user" ? "user default instructions" : "workspace instructions";
}
