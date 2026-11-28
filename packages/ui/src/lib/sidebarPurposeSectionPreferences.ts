interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SidebarSection {
  id: string;
  name: string;
}

export interface SidebarPurposeSectionPreferences {
  projectsExpanded: boolean;
  conversationsExpanded: boolean;
  sectionOrder: string[];
  sections: SidebarSection[];
  projectSectionByKey: Record<string, string>;
  expandedBySectionId: Record<string, boolean>;
}

export const SIDEBAR_PURPOSE_SECTION_PREFERENCES_STORAGE_KEY =
  "zcode-sidebar-purpose-section-preferences";
const BUILTIN_IDS = ["projects", "conversations"];

function getBrowserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function defaults(): SidebarPurposeSectionPreferences {
  return {
    projectsExpanded: true,
    conversationsExpanded: true,
    sectionOrder: [...BUILTIN_IDS],
    sections: [],
    projectSectionByKey: {},
    expandedBySectionId: {},
  };
}

export function reorderSidebarPurposeSections(
  sectionOrder: readonly string[],
  activeId: string,
  overId: string,
): string[] {
  const order = [...sectionOrder];
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  if (from >= 0 && to >= 0 && from !== to) order.splice(to, 0, order.splice(from, 1)[0]!);
  return order;
}

export function readSidebarPurposeSectionPreferences(
  storage: StorageLike | null = getBrowserStorage(),
): SidebarPurposeSectionPreferences {
  try {
    const raw = storage?.getItem(SIDEBAR_PURPOSE_SECTION_PREFERENCES_STORAGE_KEY);
    if (!raw) return defaults();
    const value = JSON.parse(raw) as Partial<SidebarPurposeSectionPreferences> | null;
    if (!value || typeof value !== "object") return defaults();
    const ids = new Set(BUILTIN_IDS);
    const sections = (Array.isArray(value.sections) ? value.sections : []).filter((section) => {
      if (
        !section ||
        typeof section.id !== "string" ||
        typeof section.name !== "string" ||
        !section.name.trim() ||
        ids.has(section.id)
      )
        return false;
      ids.add(section.id);
      return true;
    });
    return {
      sections,
      projectsExpanded: value.projectsExpanded !== false,
      conversationsExpanded: value.conversationsExpanded !== false,
      sectionOrder: [
        ...new Set([
          ...(Array.isArray(value.sectionOrder) ? value.sectionOrder : []).filter((id) =>
            ids.has(id),
          ),
          ...ids,
        ]),
      ],
      projectSectionByKey: Object.fromEntries(
        Object.entries(value.projectSectionByKey ?? {}).filter(([, id]) =>
          sections.some((section) => section.id === id),
        ),
      ),
      expandedBySectionId: Object.fromEntries(
        Object.entries(value.expandedBySectionId ?? {}).filter(
          ([id, expanded]) => ids.has(id) && typeof expanded === "boolean",
        ),
      ),
    };
  } catch {
    return defaults();
  }
}

export function persistSidebarPurposeSectionPreferences(
  preferences: SidebarPurposeSectionPreferences,
  storage: StorageLike | null = getBrowserStorage(),
) {
  try {
    storage?.setItem(
      SIDEBAR_PURPOSE_SECTION_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        projectsExpanded: preferences.projectsExpanded,
        conversationsExpanded: preferences.conversationsExpanded,
        sectionOrder: preferences.sectionOrder,
        sections: preferences.sections,
        projectSectionByKey: preferences.projectSectionByKey,
        expandedBySectionId: preferences.expandedBySectionId,
      }),
    );
  } catch {
    // 受限 WebView 或隐私模式可能禁止写入，当前窗口的偏好仍可使用。
  }
}
