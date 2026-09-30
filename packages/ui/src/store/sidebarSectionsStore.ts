import { create } from "zustand";
import { createUuid } from "@zcode/shared";
import { getSafeLocalStorage, type BrowserStorageLike } from "../lib/browserEnvironment.js";
import {
  readSidebarSectionPreferences,
  persistSidebarSectionPreferences,
  type SidebarSectionPreferences,
} from "../lib/sidebarPurposeSectionPreferences.js";

interface SidebarSectionsState extends SidebarSectionPreferences {
  createSection: (name: string, workspaceKey?: string) => string | null;
  renameSection: (id: string, name: string) => void;
  removeSection: (id: string) => void;
  moveProject: (workspaceKey: string, sectionId: string) => void;
  setProjectPinned: (projectId: string, pinned: boolean) => void;
  migrateProjectKey: (projectId: string, legacyWorkspaceKeys: readonly string[]) => void;
  setSectionExpanded: (id: string, expanded: boolean) => void;
  setProjectSectionsExpanded: (expanded: boolean) => void;
  reorderSections: (activeId: string, overId: string) => void;
}

export function createSidebarSectionsStore(
  storage: BrowserStorageLike | null = getSafeLocalStorage(),
) {
  const initial = readSidebarSectionPreferences(storage);
  return create<SidebarSectionsState>((set, get) => {
    const commit = (patch: Partial<SidebarSectionPreferences>) => {
      set(patch);
      const {
        sections,
        sectionOrder,
        projectSectionByWorkspaceKey,
        expandedBySectionId,
        pinnedProjectIds,
      } = get();
      persistSidebarSectionPreferences(
        {
          sections,
          sectionOrder,
          projectSectionByWorkspaceKey,
          expandedBySectionId,
          pinnedProjectIds,
        },
        storage,
      );
    };
    return {
      ...initial,
      createSection(name, workspaceKey) {
        const trimmedName = name.trim();
        if (!trimmedName) return null;
        const id = createUuid();
        const state = get();
        const sectionOrder = [...state.sectionOrder];
        sectionOrder.splice(sectionOrder.indexOf("projects"), 0, id);
        commit({
          sections: [...state.sections, { id, name: trimmedName }],
          sectionOrder,
          ...(workspaceKey
            ? {
                projectSectionByWorkspaceKey: {
                  ...state.projectSectionByWorkspaceKey,
                  [workspaceKey]: id,
                },
              }
            : {}),
        });
        return id;
      },
      renameSection(id, name) {
        const trimmedName = name.trim();
        if (!trimmedName) return;
        commit({
          sections: get().sections.map((section) =>
            section.id === id ? { ...section, name: trimmedName } : section,
          ),
        });
      },
      removeSection(id) {
        if (!get().sections.some((section) => section.id === id)) return;
        const state = get();
        // 分区只拥有归属；删除时清理映射，让项目投影回默认区域，保留原任务和项目顺序。
        commit({
          sections: state.sections.filter((section) => section.id !== id),
          sectionOrder: state.sectionOrder.filter((sectionId) => sectionId !== id),
          projectSectionByWorkspaceKey: Object.fromEntries(
            Object.entries(state.projectSectionByWorkspaceKey).filter(
              ([, sectionId]) => sectionId !== id,
            ),
          ),
          expandedBySectionId: {
            ...Object.fromEntries(
              Object.entries(state.expandedBySectionId).filter(([sectionId]) => sectionId !== id),
            ),
            projects: true,
          },
        });
      },
      moveProject(workspaceKey, sectionId) {
        if (sectionId !== "projects" && !get().sections.some((section) => section.id === sectionId))
          return;
        const projectSectionByWorkspaceKey = { ...get().projectSectionByWorkspaceKey };
        if (sectionId === "projects") delete projectSectionByWorkspaceKey[workspaceKey];
        else projectSectionByWorkspaceKey[workspaceKey] = sectionId;
        commit({
          projectSectionByWorkspaceKey,
          expandedBySectionId: { ...get().expandedBySectionId, [sectionId]: true },
        });
      },
      setProjectPinned(projectId, pinned) {
        const pinnedProjectIds = get().pinnedProjectIds;
        if (pinnedProjectIds.includes(projectId) === pinned) return;
        commit({
          pinnedProjectIds: pinned
            ? [...pinnedProjectIds, projectId]
            : pinnedProjectIds.filter((id) => id !== projectId),
        });
      },
      migrateProjectKey(projectId, legacyWorkspaceKeys) {
        const current = get().projectSectionByWorkspaceKey;
        const legacyKeys = legacyWorkspaceKeys.filter((key) => key !== projectId && key in current);
        if (legacyKeys.length === 0) return;
        const projectSectionByWorkspaceKey = { ...current };
        const sectionId = current[projectId] ?? current[legacyKeys[0]!];
        for (const key of legacyKeys) delete projectSectionByWorkspaceKey[key];
        if (sectionId) projectSectionByWorkspaceKey[projectId] = sectionId;
        commit({ projectSectionByWorkspaceKey });
      },
      setSectionExpanded(id, expanded) {
        commit({ expandedBySectionId: { ...get().expandedBySectionId, [id]: expanded } });
      },
      setProjectSectionsExpanded(expanded) {
        const state = get();
        commit({
          expandedBySectionId: {
            ...state.expandedBySectionId,
            ...Object.fromEntries(
              state.sectionOrder.filter((id) => id !== "conversations").map((id) => [id, expanded]),
            ),
          },
        });
      },
      reorderSections(activeId, overId) {
        const sectionOrder = [...get().sectionOrder];
        const from = sectionOrder.indexOf(activeId);
        const to = sectionOrder.indexOf(overId);
        if (from < 0 || to < 0 || from === to) return;
        sectionOrder.splice(to, 0, sectionOrder.splice(from, 1)[0]!);
        commit({ sectionOrder });
      },
    };
  });
}

export const useSidebarSectionsStore = createSidebarSectionsStore();
