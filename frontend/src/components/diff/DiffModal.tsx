/**
 * DiffModal - Full-screen modal for viewing commit diffs.
 *
 * Opened from HistoryTab via:
 * - "View" button: Single commit diff (vs parent)
 * - "Compare" button: Diff between two selected commits
 *
 * Shows commit info in header, renders DiffViewer for actual diff content.
 * Modal state is managed in selectionStore.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSelectionStore } from '@/store/selectionStore'
import { DiffViewer } from './DiffViewer'

function formatCompactDateTime(timestamp: number | null): string {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function DiffModal() {
  const {
    diffModalOpen,
    diffCommitFrom,
    diffCommitTo,
    diffCommitFromTimestamp,
    diffCommitToTimestamp,
    closeDiffModal,
    currentPath
  } = useSelectionStore()

  if (!diffCommitTo) return null

  return (
    <Dialog open={diffModalOpen} onOpenChange={(open) => !open && closeDiffModal()}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {diffCommitFrom ? (
              <>
                Comparing{' '}
                <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                  {diffCommitFrom.substring(0, 7)}
                </code>
                {diffCommitFromTimestamp && (
                  <span className="text-gray-500 text-sm font-normal ml-1">
                    {formatCompactDateTime(diffCommitFromTimestamp)}
                  </span>
                )}
                {' ... '}
                <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                  {diffCommitTo.substring(0, 7)}
                </code>
                {diffCommitToTimestamp && (
                  <span className="text-gray-500 text-sm font-normal ml-1">
                    {formatCompactDateTime(diffCommitToTimestamp)}
                  </span>
                )}
              </>
            ) : (
              <>
                Changes in{' '}
                <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                  {diffCommitTo.substring(0, 7)}
                </code>
                {diffCommitToTimestamp && (
                  <span className="text-gray-500 text-sm font-normal ml-1">
                    {formatCompactDateTime(diffCommitToTimestamp)}
                  </span>
                )}
              </>
            )}
            {currentPath && (
              <span className="text-gray-500 text-sm font-normal ml-2">
                (filtered by {currentPath})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden -mx-6 -mb-6">
          <DiffViewer
            toCommit={diffCommitTo}
            fromCommit={diffCommitFrom || undefined}
            path={currentPath || undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
