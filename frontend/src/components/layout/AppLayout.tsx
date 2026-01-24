import { Panel, Group, Separator } from 'react-resizable-panels'
import { useRepository } from '@/api/hooks'
import { FileTree } from '@/components/file-tree/FileTree'
import { FileList } from '@/components/file-list/FileList'
import { BottomPanel } from '@/components/bottom-panel/BottomPanel'
import { DiffModal } from '@/components/diff/DiffModal'
import { RepoSwitcher } from '@/components/repo-switcher/RepoSwitcher'

function ResizeHandle({ id, direction }: { id: string; direction: 'horizontal' | 'vertical' }) {
  return (
    <Separator
      id={id}
      className={`resize-handle ${
        direction === 'horizontal' ? 'w-2' : 'h-2'
      }`}
      style={{ cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize' }}
    />
  )
}

export function AppLayout() {
  const { data: repo, isLoading, error } = useRepository()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading repository...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-red-500 gap-4">
        <div className="text-lg font-medium">Failed to load repository</div>
        <div className="text-sm text-gray-500">
          Make sure the backend is running on port 3001
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white">
        <RepoSwitcher />
        <div>
          <h1 className="text-sm font-semibold">{repo?.name}</h1>
          <p className="text-xs text-gray-500">
            {repo?.head_branch && `Branch: ${repo.head_branch}`}
            {repo?.head_commit && ` - ${repo.head_commit.message.split('\n')[0].substring(0, 50)}`}
          </p>
        </div>
      </header>

      {/* Main content */}
      <Group orientation="horizontal" style={{ flex: 1 }}>
        {/* Left panel - File tree */}
        <Panel id="file-tree" defaultSize={25} minSize={5}>
          <div className="h-full border-r border-gray-200 bg-white">
            <FileTree />
          </div>
        </Panel>

        <ResizeHandle id="horizontal-resize" direction="horizontal" />

        {/* Right section */}
        <Panel id="main-content" defaultSize={75} minSize={5}>
          <Group orientation="vertical" style={{ height: '100%' }}>
            {/* Top - File list */}
            <Panel id="file-list" defaultSize={60} minSize={30}>
              <div className="h-full bg-white">
                <FileList />
              </div>
            </Panel>

            <ResizeHandle id="vertical-resize" direction="vertical" />

            {/* Bottom - History/Status panel */}
            <Panel id="bottom-panel" defaultSize={40} minSize={20}>
              <div className="h-full border-t border-gray-200 bg-white">
                <BottomPanel />
              </div>
            </Panel>
          </Group>
        </Panel>
      </Group>

      {/* Diff modal */}
      <DiffModal />
    </div>
  )
}
