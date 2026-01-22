import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSelectionStore } from '@/store/selectionStore'
import { DiffViewer } from './DiffViewer'

export function DiffModal() {
  const { diffModalOpen, diffCommitFrom, diffCommitTo, closeDiffModal, currentPath } = useSelectionStore()

  if (!diffCommitTo) return null

  return (
    <Dialog open={diffModalOpen} onOpenChange={(open) => !open && closeDiffModal()}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {diffCommitFrom ? (
              <>
                Comparing{' '}
                <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                  {diffCommitFrom.substring(0, 7)}
                </code>
                {' ... '}
                <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                  {diffCommitTo.substring(0, 7)}
                </code>
              </>
            ) : (
              <>
                Changes in{' '}
                <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                  {diffCommitTo.substring(0, 7)}
                </code>
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
