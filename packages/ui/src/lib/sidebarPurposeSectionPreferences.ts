import type { BrowserStorageLike } from "./browserEnvironment.js";
import { logger } from "../logger.js";

export interface SidebarSection {
  id: string;
  name: string;
}
export interface SidebarSectionPreferences {
  sections: SidebarSection[];
  sectionOrder: string[];
  projectSectionByWorkspaceKey: Record<string, string>;
  expandedBySectionId: Record<string, boolean>;
  pinnedProjectIds: string[];
}

const STORAGE_KEY = "zcode-sidebar-project-sections";
const LEGACY_STORAGE_KEY = "zcode-sidebar-purpose-section-preferences";
const BUILTIN_IDS = ["projects", "conversations"];

function defaultPreferences(): SidebarSectionPreferences {
  return {
    sections: [],
    sectionOrder: [...BUILTIN_IDS],
    projectSectionByWorkspaceKey: {},
    expandedBySectionId: {},
    pinnedProjectIds: [],
  };
}

export function readSidebarSectionPreferences(
  storage: BrowserStorageLike | null,
): SidebarSectionPreferences {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) {
      const legacyRaw = storage?.getItem(LEGACY_STORAGE_KEY);
      if (!legacyRaw) return defaultPreferences();
      const legacy = JSON.parse(legacyRaw);
      return {
        ...defaultPreferences(),
        sectionOrder:
          Array.isArray(legacy.sectionOrder) && legacy.sectionOrder[0] === "conversations"
            ? ["conversations", "projects"]
            : [...BUILTIN_IDS],
        expandedBySectionId: {
          projects: legacy.projectsExpanded !== false,
          conversations: legacy.conversationsExpanded !== false,
        },
      };
    }
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Array.isArray(saved.sections)) return defaultPreferences();
    const ids = new Set(BUILTIN_IDS);
    const sections = saved.sections.filter((section: SidebarSection) => {
      if (!section || typeof section.id !== "string" || typeof section.name !== "string")
        return false;
      if (!section.name.trim() || ids.has(section.id)) return false;
      ids.add(section.id);
      return true;
    }) as SidebarSection[];
    const sectionOrder = [
      ...new Set<string>(
        (Array.isArray(saved.sectionOrder) ? saved.sectionOrder : []).filter((id: string) =>
          ids.has(id),
        ),
      ),
    ];
    for (const id of ids) if (!sectionOrder.includes(id)) sectionOrder.push(id);
    return {
      sections,
      sectionOrder,
      projectSectionByWorkspaceKey: Object.fromEntries(
        Object.entries(saved.projectSectionByWorkspaceKey ?? {}).filter(
          ([, id]) => typeof id === "string" && !BUILTIN_IDS.includes(id) && ids.has(id),
        ),
      ) as Record<string, string>,
      expandedBySectionId: Object.fromEntries(
        Object.entries(saved.expandedBySectionId ?? {}).filter(
          ([id, expanded]) => ids.has(id) && typeof expanded === "boolean",
        ),
      ) as Record<string, boolean>,
      pinnedProjectIds: [
        ...new Set<string>(
          (Array.isArray(saved.pinnedProjectIds) ? saved.pinnedProjectIds : []).filter(
            (id: unknown): id is string => typeof id === "string",
          ),
        ),
      ],
    };
  } catch {
    return defaultPreferences();
  }
}

export function persistSidebarSectionPreferences(
  preferences: SidebarSectionPreferences,
  storage: BrowserStorageLike | null,
): void {
  if (!storage) {
    logger.warn("[sidebarSections] 本端存储不可用，项目分区仅在当前页面保留");
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...preferences }));
  } catch (error) {
    logger.warn("[sidebarSections] 无法保存本端项目分区", error);
  }
}
