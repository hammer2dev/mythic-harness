import { create } from "zustand";
import { createUuid } from "@zcode/shared";
import {
  persistSidebarPurposeSectionPreferences,
  readSidebarPurposeSectionPreferences,
  reorderSidebarPurposeSections,
  type SidebarPurposeSectionPreferences,
} from "@/lib/sidebarPurposeSectionPreferences.js";

interface SidebarSectionsState extends SidebarPurposeSectionPreferences {
  createSection(name: string, projectKey?: string): void;
  renameSection(id: string, name: string): void;
  removeSection(id: string): void;
  moveProject(projectKey: string, sectionId: string): void;
  setSectionExpanded(id: string, expanded: boolean): void;
  reorderSections(activeId: string, overId: string): void;
}

export const useSidebarSectionsStore = create<SidebarSectionsState>((set, get) => {
  const commit = (patch: Partial<SidebarPurposeSectionPreferences>) => {
    set(patch);
    persistSidebarPurposeSectionPreferences(get());
  };
  return {
    ...readSidebarPurposeSectionPreferences(),
    createSection(name, projectKey) {
      const trimmedName = name.trim();
      if (!trimmedName) return;
      const id = createUuid();
      const { sections, sectionOrder, projectSectionByKey } = get();
      const nextOrder = [...sectionOrder];
      nextOrder.splice(nextOrder.indexOf("projects"), 0, id);
      commit({
        sections: [...sections, { id, name: trimmedName }],
        sectionOrder: nextOrder,
        projectSectionByKey: projectKey
          ? { ...projectSectionByKey, [projectKey]: id }
          : projectSectionByKey,
      });
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
      const { sections, sectionOrder, projectSectionByKey, expandedBySectionId } = get();
      if (!sections.some((section) => section.id === id)) return;
      commit({
        sections: sections.filter((section) => section.id !== id),
        sectionOrder: sectionOrder.filter((sectionId) => sectionId !== id),
        projectSectionByKey: Object.fromEntries(
          Object.entries(projectSectionByKey).filter(([, sectionId]) => sectionId !== id),
        ),
        expandedBySectionId: Object.fromEntries(
          Object.entries(expandedBySectionId).filter(([sectionId]) => sectionId !== id),
        ),
        projectsExpanded: true,
      });
    },
    moveProject(projectKey, sectionId) {
      const { sections, projectSectionByKey, expandedBySectionId } = get();
      if (sectionId !== "projects" && !sections.some((section) => section.id === sectionId)) return;
      const next = { ...projectSectionByKey };
      if (sectionId === "projects") {
        delete next[projectKey];
        commit({ projectSectionByKey: next, projectsExpanded: true });
      } else {
        next[projectKey] = sectionId;
        commit({
          projectSectionByKey: next,
          expandedBySectionId: { ...expandedBySectionId, [sectionId]: true },
        });
      }
    },
    setSectionExpanded(id, expanded) {
      if (id === "projects") commit({ projectsExpanded: expanded });
      else if (id === "conversations") commit({ conversationsExpanded: expanded });
      else commit({ expandedBySectionId: { ...get().expandedBySectionId, [id]: expanded } });
    },
    reorderSections(activeId, overId) {
      commit({ sectionOrder: reorderSidebarPurposeSections(get().sectionOrder, activeId, overId) });
    },
  };
});
