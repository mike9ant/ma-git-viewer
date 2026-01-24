import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  // Diff viewer settings
  diffFilePanelOpen: boolean
  diffSplitView: boolean
  diffFilesCollapsedByDefault: boolean

  // Main layout settings
  fileTreePanelSize: number

  // Setters
  setDiffFilePanelOpen: (open: boolean) => void
  setDiffSplitView: (split: boolean) => void
  setDiffFilesCollapsedByDefault: (collapsed: boolean) => void
  setFileTreePanelSize: (size: number) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Default values
      diffFilePanelOpen: true,
      diffSplitView: false,
      diffFilesCollapsedByDefault: false,
      fileTreePanelSize: 25,

      // Setters
      setDiffFilePanelOpen: (open) => set({ diffFilePanelOpen: open }),
      setDiffSplitView: (split) => set({ diffSplitView: split }),
      setDiffFilesCollapsedByDefault: (collapsed) => set({ diffFilesCollapsedByDefault: collapsed }),
      setFileTreePanelSize: (size) => set({ fileTreePanelSize: size }),
    }),
    {
      name: 'git-viewer-settings',
    }
  )
)
