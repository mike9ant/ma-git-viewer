import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  // Diff viewer settings
  diffFilePanelOpen: boolean
  diffSplitView: boolean
  diffFilesCollapsedByDefault: boolean
  diffFilePanelSize: number

  // Main layout settings
  fileTreePanelSize: number

  // File tree settings
  fileTreeShowFiles: boolean

  // Setters
  setDiffFilePanelOpen: (open: boolean) => void
  setDiffSplitView: (split: boolean) => void
  setDiffFilesCollapsedByDefault: (collapsed: boolean) => void
  setDiffFilePanelSize: (size: number) => void
  setFileTreePanelSize: (size: number) => void
  setFileTreeShowFiles: (show: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Default values
      diffFilePanelOpen: true,
      diffSplitView: false,
      diffFilesCollapsedByDefault: false,
      diffFilePanelSize: 20,
      fileTreePanelSize: 25,
      fileTreeShowFiles: false,

      // Setters
      setDiffFilePanelOpen: (open) => set({ diffFilePanelOpen: open }),
      setDiffSplitView: (split) => set({ diffSplitView: split }),
      setDiffFilesCollapsedByDefault: (collapsed) => set({ diffFilesCollapsedByDefault: collapsed }),
      setDiffFilePanelSize: (size) => set({ diffFilePanelSize: size }),
      setFileTreePanelSize: (size) => set({ fileTreePanelSize: size }),
      setFileTreeShowFiles: (show) => set({ fileTreeShowFiles: show }),
    }),
    {
      name: 'git-viewer-settings',
    }
  )
)
