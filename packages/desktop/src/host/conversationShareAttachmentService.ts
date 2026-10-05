import { Event as RpcEvent } from "@zcode/rpc";
import type { IConversationShareService } from "@zcode/services";
export function scopeConversationShareServiceForAttachment(
  service: IConversationShareService,
  clientMode: "desktop-continuous" | "web-remote-replayable",
): IConversationShareService {
  if (clientMode === "desktop-continuous") return service;
  const reject = async (): Promise<never> => {
    throw Object.assign(new Error("Share import requires a Desktop workspace"), {
      kind: "feature_disabled" as const,
    });
  };
  return {
    importShare: reject,
    onDynamicImportProgress: () => RpcEvent.None,
    getImportedConversation: async () => null,
    getPreview: (code) => service.getPreview(code),
    getContinuation: reject,
  };
}
