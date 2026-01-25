import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  // Diff viewer settings
  diffFilePanelOpen: boolean
  diffSplitView: boolean
  diffFilesCollapsedByDefault: boolean
  diffFilePanelSize: number
  diffCompactMode: boolean
  diffFilterMode: 'hide' | 'gray'

  // Main layout settings
  fileTreePanelSize: number

  // File tree settings
  fileTreeShowFiles: boolean

  // Display density settings
  compactMode: boolean

  // Contributor filter (shared between history and diff)
  contributorFilterEnabled: boolean

  // Setters
  setDiffFilePanelOpen: (open: boolean) => void
  setDiffSplitView: (split: boolean) => void
  setDiffFilesCollapsedByDefault: (collapsed: boolean) => void
  setDiffFilePanelSize: (size: number) => void
  setDiffCompactMode: (compact: boolean) => void
  setDiffFilterMode: (mode: 'hide' | 'gray') => void
  setFileTreePanelSize: (size: number) => void
  setFileTreeShowFiles: (show: boolean) => void
  setCompactMode: (compact: boolean) => void
  setContributorFilterEnabled: (enabled: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Default values
      diffFilePanelOpen: true,
      diffSplitView: false,
      diffFilesCollapsedByDefault: false,
      diffFilePanelSize: 20,
      diffCompactMode: false,
      diffFilterMode: 'hide',
      fileTreePanelSize: 25,
      fileTreeShowFiles: false,
      compactMode: false,
      contributorFilterEnabled: false,

      // Setters
      setDiffFilePanelOpen: (open) => set({ diffFilePanelOpen: open }),
      setDiffSplitView: (split) => set({ diffSplitView: split }),
      setDiffFilesCollapsedByDefault: (collapsed) => set({ diffFilesCollapsedByDefault: collapsed }),
      setDiffFilePanelSize: (size) => set({ diffFilePanelSize: size }),
      setDiffCompactMode: (compact) => set({ diffCompactMode: compact }),
      setDiffFilterMode: (mode) => set({ diffFilterMode: mode }),
      setFileTreePanelSize: (size) => set({ fileTreePanelSize: size }),
      setFileTreeShowFiles: (show) => set({ fileTreeShowFiles: show }),
      setCompactMode: (compact) => set({ compactMode: compact }),
      setContributorFilterEnabled: (enabled) => set({ contributorFilterEnabled: enabled }),
    }),
    {
      name: 'git-viewer-settings',
    }
  )
)
