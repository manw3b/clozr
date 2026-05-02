import { create } from "zustand";
import type { Workspace } from "../lib/db/types";
import { workspaceDb } from "../lib/db/workspace";

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  loadWorkspaces: () => Promise<void>;
  setActiveWorkspace: (workspace: Workspace) => void;
  addWorkspace: (workspace: Workspace) => void;
  updateWorkspace: (workspace: Workspace) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  activeWorkspace: null,
  isLoading: true,

  loadWorkspaces: async () => {
    set({ isLoading: true });
    try {
      const workspaces = await workspaceDb.getAll();
      set({
        workspaces,
        activeWorkspace: workspaces[0] ?? null,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false });
      throw err instanceof Error
        ? err
        : new Error("Error cargando espacios de trabajo");
    }
  },

  setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace }),

  addWorkspace: (workspace) =>
    set((state) => ({
      workspaces: [...state.workspaces, workspace],
      activeWorkspace: state.activeWorkspace ?? workspace,
    })),

  updateWorkspace: (workspace) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspace.id ? workspace : w,
      ),
      activeWorkspace:
        state.activeWorkspace?.id === workspace.id
          ? workspace
          : state.activeWorkspace,
    })),
}));
