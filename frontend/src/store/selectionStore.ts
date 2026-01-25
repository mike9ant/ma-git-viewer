/**
 * Selection state store - tracks user's current navigation and selection.
 *
 * Manages:
 * - currentPath: Currently viewed directory in FileList
 * - selectedFile: Currently selected file (if any)
 * - selectedCommits: Up to 2 commits selected for comparison
 * - diffModal: State for the diff viewer modal
 *
 * This is ephemeral UI state (not persisted). For persisted settings,
 * see settingsStore.ts.
 */

import { create } from 'zustand'

interface SelectionState {
  currentPath: string
  selectedFile: string | null
  selectedCommits: string[]
  diffModalOpen: boolean
  diffCommitFrom: string | null
  diffCommitTo: string | null
  diffCommitFromTimestamp: number | null
  diffCommitToTimestamp: number | null

  setCurrentPath: (path: string) => void
  setSelectedFile: (file: string | null) => void
  toggleCommitSelection: (commitOid: string) => void
  clearCommitSelection: () => void
  openDiffModal: (from: string | null, to: string, fromTimestamp?: number | null, toTimestamp?: number | null) => void
  closeDiffModal: () => void
  resetSelection: () => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  currentPath: '',
  selectedFile: null,
  selectedCommits: [],
  diffModalOpen: false,
  diffCommitFrom: null,
  diffCommitTo: null,
  diffCommitFromTimestamp: null,
  diffCommitToTimestamp: null,

  setCurrentPath: (path) => set({ currentPath: path, selectedFile: null }),

  setSelectedFile: (file) => set({ selectedFile: file }),

  toggleCommitSelection: (commitOid) =>
    set((state) => {
      const isSelected = state.selectedCommits.includes(commitOid)
      if (isSelected) {
        return { selectedCommits: state.selectedCommits.filter((c) => c !== commitOid) }
      }
      // Limit to 2 selections for comparison
      if (state.selectedCommits.length >= 2) {
        return { selectedCommits: [state.selectedCommits[1], commitOid] }
      }
      return { selectedCommits: [...state.selectedCommits, commitOid] }
    }),

  clearCommitSelection: () => set({ selectedCommits: [] }),

  openDiffModal: (from, to, fromTimestamp = null, toTimestamp = null) =>
    set({
      diffModalOpen: true,
      diffCommitFrom: from,
      diffCommitTo: to,
      diffCommitFromTimestamp: fromTimestamp,
      diffCommitToTimestamp: toTimestamp,
    }),

  closeDiffModal: () =>
    set({
      diffModalOpen: false,
      diffCommitFrom: null,
      diffCommitTo: null,
      diffCommitFromTimestamp: null,
      diffCommitToTimestamp: null,
    }),

  resetSelection: () =>
    set({
      currentPath: '',
      selectedFile: null,
      selectedCommits: [],
      diffModalOpen: false,
      diffCommitFrom: null,
      diffCommitTo: null,
      diffCommitFromTimestamp: null,
      diffCommitToTimestamp: null,
    }),
}))
