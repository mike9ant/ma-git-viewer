import { useState, useRef, useEffect } from 'react'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'
import { useDiff } from '@/api/hooks'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { FileEdit, FilePlus, FileMinus, FileX2, Columns2, Rows2, PanelLeftClose, PanelLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileDiff } from '@/api/types'

function abbreviateFilename(path: string, maxLength: number): string {
  if (path.length <= maxLength) return path

  const filename = path.split('/').pop() || path
  const dirname = path.slice(0, path.length - filename.length - 1)

  // If filename alone is too long, abbreviate it
  if (filename.length >= maxLength - 3) {
    const half = Math.floor((maxLength - 3) / 2)
    return filename.slice(0, half) + '...' + filename.slice(-half)
  }

  // Otherwise abbreviate the directory part
  const availableForDir = maxLength - filename.length - 4 // 4 for "/..."
  if (availableForDir <= 0) {
    return '.../' + filename
  }

  return dirname.slice(0, availableForDir) + '.../' + filename
}

interface DiffViewerProps {
  toCommit: string
  fromCommit?: string
  path?: string
}

function getStatusIcon(status: FileDiff['status']) {
  switch (status) {
    case 'added':
      return <FilePlus className="h-4 w-4 text-green-500" />
    case 'deleted':
      return <FileMinus className="h-4 w-4 text-red-500" />
    case 'modified':
      return <FileEdit className="h-4 w-4 text-yellow-500" />
    case 'renamed':
      return <FileX2 className="h-4 w-4 text-blue-500" />
    default:
      return <FileEdit className="h-4 w-4 text-gray-500" />
  }
}

function getStatusLabel(status: FileDiff['status']) {
  switch (status) {
    case 'added':
      return 'Added'
    case 'deleted':
      return 'Deleted'
    case 'modified':
      return 'Modified'
    case 'renamed':
      return 'Renamed'
    case 'copied':
      return 'Copied'
    default:
      return status
  }
}

export function DiffViewer({ toCommit, fromCommit, path }: DiffViewerProps) {
  const [splitView, setSplitView] = useState(false)
  const [filePanelOpen, setFilePanelOpen] = useState(true)
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null)
  const fileRefs = useRef<(HTMLDivElement | null)[]>([])
  const { data: diff, isLoading, error } = useDiff(toCommit, fromCommit, path)

  // Reset refs array when files change
  useEffect(() => {
    if (diff) {
      fileRefs.current = fileRefs.current.slice(0, diff.files.length)
    }
  }, [diff])

  const scrollToFile = (index: number) => {
    setSelectedFileIndex(index)
    fileRefs.current[index]?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading diff...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Error loading diff
      </div>
    )
  }

  if (!diff) return null

  return (
    <div className="h-full flex flex-col">
      {/* Stats - fixed header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFilePanelOpen(!filePanelOpen)}
          className="h-7 px-2"
          title={filePanelOpen ? "Hide file list" : "Show file list"}
        >
          {filePanelOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeft className="h-4 w-4" />
          )}
        </Button>
        <span className="text-sm">
          <span className="font-medium">{diff.stats.files_changed}</span> files changed
        </span>
        <span className="text-sm text-green-600">
          +{diff.stats.insertions} insertions
        </span>
        <span className="text-sm text-red-600">
          -{diff.stats.deletions} deletions
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={splitView ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSplitView(true)}
            className="h-7 px-2"
            title="Side by side"
          >
            <Columns2 className="h-4 w-4" />
          </Button>
          <Button
            variant={!splitView ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSplitView(false)}
            className="h-7 px-2"
            title="Unified"
          >
            <Rows2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main content with optional file panel */}
      <div className="flex-1 min-h-0 flex">
        {/* File list panel */}
        {filePanelOpen && (
          <ScrollArea className="w-56 shrink-0 border-r border-gray-200 bg-gray-50">
            <div className="py-2">
              {diff.files.map((file, index) => {
                const fileName = file.new_path || file.old_path || 'unknown'
                const displayName = abbreviateFilename(fileName, 25)

                return (
                  <button
                    key={index}
                    onClick={() => scrollToFile(index)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 transition-colors",
                      selectedFileIndex === index && "bg-blue-50 hover:bg-blue-100"
                    )}
                    title={fileName}
                  >
                    {getStatusIcon(file.status)}
                    <span className="text-xs font-mono truncate">{displayName}</span>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        )}

        {/* Scrollable diff content */}
        <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {diff.files.map((file, index) => {
                const fileName = file.new_path || file.old_path || 'unknown'

                return (
                  <div
                    key={index}
                    ref={(el) => { fileRefs.current[index] = el }}
                    className={cn(
                      "border border-gray-200 rounded-lg overflow-hidden",
                      selectedFileIndex === index && "ring-2 ring-blue-400"
                    )}
                  >
                    {/* File header */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
                      {getStatusIcon(file.status)}
                      <span className="text-sm font-medium">{fileName}</span>
                      {file.old_path && file.new_path && file.old_path !== file.new_path && (
                        <span className="text-xs text-gray-500">
                          (from {file.old_path})
                        </span>
                      )}
                      <span
                        className={cn(
                          "ml-auto px-2 py-0.5 text-xs rounded",
                          file.status === 'added' && "bg-green-100 text-green-700",
                          file.status === 'deleted' && "bg-red-100 text-red-700",
                          file.status === 'modified' && "bg-yellow-100 text-yellow-700",
                          file.status === 'renamed' && "bg-blue-100 text-blue-700"
                        )}
                      >
                        {getStatusLabel(file.status)}
                      </span>
                    </div>

                    {/* Diff content */}
                    {file.is_binary ? (
                      <div className="p-4 text-sm text-gray-500">
                        Binary file not shown
                      </div>
                    ) : file.old_content !== undefined || file.new_content !== undefined ? (
                      <div className="text-xs">
                        <ReactDiffViewer
                          oldValue={file.old_content || ''}
                          newValue={file.new_content || ''}
                          splitView={splitView}
                          compareMethod={DiffMethod.LINES}
                          useDarkTheme={false}
                          styles={{
                            variables: {
                              light: {
                                diffViewerBackground: 'transparent',
                                addedBackground: '#e6ffec',
                                addedColor: '#24292f',
                                removedBackground: '#ffebe9',
                                removedColor: '#24292f',
                                wordAddedBackground: '#abf2bc',
                                wordRemovedBackground: '#ff818266',
                                addedGutterBackground: '#ccffd8',
                                removedGutterBackground: '#ffd7d5',
                                gutterBackground: '#f6f8fa',
                                gutterBackgroundDark: '#f0f1f3',
                                highlightBackground: '#fffbdd',
                                highlightGutterBackground: '#fff5b1',
                              },
                            },
                          }}
                        />
                      </div>
                    ) : (
                      <div className="p-4 text-sm text-gray-500">
                        No content available
                      </div>
                    )}
                  </div>
                )
              })}

              {diff.files.length === 0 && (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  No changes in this diff
                </div>
              )}
            </div>
        </ScrollArea>
      </div>
    </div>
  )
}
