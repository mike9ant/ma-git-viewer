import { create } from 'zustand'

interface SelectionState {
  currentPath: string
  selectedFile: string | null
  selectedCommits: string[]
  diffModalOpen: boolean
  diffCommitFrom: string | null
  diffCommitTo: string | null

  setCurrentPath: (path: string) => void
  setSelectedFile: (file: string | null) => void
  toggleCommitSelection: (commitOid: string) => void
  clearCommitSelection: () => void
  openDiffModal: (from: string | null, to: string) => void
  closeDiffModal: () => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  currentPath: '',
  selectedFile: null,
  selectedCommits: [],
  diffModalOpen: false,
  diffCommitFrom: null,
  diffCommitTo: null,

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

  openDiffModal: (from, to) =>
    set({ diffModalOpen: true, diffCommitFrom: from, diffCommitTo: to }),

  closeDiffModal: () =>
    set({ diffModalOpen: false, diffCommitFrom: null, diffCommitTo: null }),
}))
