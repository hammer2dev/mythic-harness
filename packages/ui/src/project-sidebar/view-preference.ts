import type { ProjectSidebarView } from "@/project-sidebar/contract.js";
import { getSafeLocalStorage } from "@/lib/browserEnvironment.js";

export const WORKSPACE_SIDEBAR_DEFAULT_WIDTH_PX = 264;
export const WORKSPACE_SIDEBAR_MIN_WIDTH_PX = 264;
export const WORKSPACE_SIDEBAR_MAX_WIDTH_RATIO = 0.5;
const WORKSPACE_SIDEBAR_WIDTH_STORAGE_KEY = "zcode:workspace-shell:sidebar-width-px";

export function clampWorkspaceSidebarWidth(widthPx: number, containerWidthPx?: number) {
  const maxWidthPx =
    containerWidthPx && containerWidthPx > 0
      ? Math.max(
          WORKSPACE_SIDEBAR_MIN_WIDTH_PX,
          containerWidthPx * WORKSPACE_SIDEBAR_MAX_WIDTH_RATIO,
        )
      : Number.POSITIVE_INFINITY;

  return Math.round(Math.max(WORKSPACE_SIDEBAR_MIN_WIDTH_PX, Math.min(widthPx, maxWidthPx)));
}

export function readStoredWorkspaceSidebarWidthPx(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? clampWorkspaceSidebarWidth(parsed) : null;
  } catch {
    return null;
  }
}

export function persistWorkspaceSidebarWidthPx(widthPx: number) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(WORKSPACE_SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(widthPx)));
  } catch {
    // ignore
  }
}

export function readProjectSidebarView(
  storage: Pick<Storage, "getItem"> | null = getSafeLocalStorage(),
): ProjectSidebarView {
  const read = (key: string): Record<string, unknown> => {
    try {
      return JSON.parse(storage?.getItem(key) ?? "null") ?? {};
    } catch {
      return {};
    }
  };
  const current = read("zcode-project-sidebar-preferences").view;
  if (current === "projects" || current === "timeline" || current === "unread") return current;
  // 原因：重构换了偏好 key；忽略旧 organizeBy 会让原本选分组的用户升级后跳回项目。
  // 只在没有有效新选择时迁移，不能在以后重启时覆盖用户的新选择。
  const legacy = read("zcode-sidebar-task-preferences").organizeBy;
  return legacy === "chronological" ? "timeline" : "projects";
}
