import type { ModelProperties, ModelTextRequest, TraceContext } from "@zcode/contracts";
import { generateText as aiGenerateText, streamText as aiStreamText } from "ai";
import type { AiSdkResolvedModel } from "./model-execution.js";

export type AiSdkGenerateTextOptions = Parameters<typeof aiGenerateText>[0];
export type AiSdkGenerateTextResult = Awaited<ReturnType<typeof aiGenerateText>>;
export type AiSdkStreamTextOptions = Parameters<typeof aiStreamText>[0];
export type AiSdkStreamTextResult = ReturnType<typeof aiStreamText>;
export type ResolvedAiSdkModel = AiSdkResolvedModel & {
  properties: ModelProperties;
};

export interface AiSdkModelRuntime {
  generateText(options: AiSdkGenerateTextOptions): Promise<AiSdkGenerateTextResult>;
  streamText(options: AiSdkStreamTextOptions): AiSdkStreamTextResult;
}

export interface AiSdkModelTextRequest extends ModelTextRequest {
  abortSignal?: AbortSignal;
  traceContext?: TraceContext;
  streamIdleTimeoutRetryNumber?: number;
  // 同一源文件加载边界还需显式接住 compact 专用 provider stream 边界，
  // 避免 contracts 构建产物尚未刷新时 adapter 独立 typecheck 丢失该 runtime-only 字段。
  preserveProviderStreamBoundaries?: boolean;
}

export const defaultRuntime: AiSdkModelRuntime = {
  generateText: aiGenerateText,
  streamText: aiStreamText,
};
