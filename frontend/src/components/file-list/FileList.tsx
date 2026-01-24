import { useMemo } from 'react'
import { Folder, File, ArrowLeft, FolderIcon, FileIcon } from 'lucide-react'
import { useTree } from '@/api/hooks'
import { useSelectionStore } from '@/store/selectionStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatBytes } from '@/lib/utils'
import type { TreeEntry } from '@/api/types'

function formatFolderContents(fileCount?: number, directoryCount?: number): React.ReactNode {
  const files = fileCount ?? 0
  const dirs = directoryCount ?? 0

  if (files === 0 && dirs === 0) {
    return <span className="text-gray-400">Empty</span>
  }

  return (
    <span className="flex items-center justify-end gap-2">
      {dirs > 0 && (
        <span className="flex items-center gap-0.5">
          {dirs}
          <FolderIcon className="h-3 w-3" />
        </span>
      )}
      {files > 0 && (
        <span className="flex items-center gap-0.5">
          {files}
          <FileIcon className="h-3 w-3" />
        </span>
      )}
    </span>
  )
}

interface FileRowProps {
  entry: TreeEntry
  onDoubleClick: () => void
  onClick: () => void
  isSelected: boolean
}

function FileRow({ entry, onDoubleClick, onClick, isSelected }: FileRowProps) {
  const isDirectory = entry.entry_type === 'directory'

  return (
    <tr
      className={cn(
        "border-b border-gray-200 hover:bg-gray-50 cursor-pointer",
        isSelected && "bg-gray-100"
      )}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
    >
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          {isDirectory ? (
            <Folder className="h-4 w-4 text-blue-500" />
          ) : (
            <File className="h-4 w-4 text-gray-500" />
          )}
          <span className="text-sm">{entry.name}</span>
        </div>
      </td>
      <td className="px-4 py-2 text-sm text-gray-500 truncate max-w-xs">
        {entry.last_commit?.message || '-'}
      </td>
      <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">
        {entry.last_commit?.relative_time || '-'}
      </td>
      <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap text-right">
        {isDirectory
          ? formatFolderContents(entry.file_count, entry.directory_count)
          : entry.size !== undefined ? formatBytes(entry.size) : '-'}
      </td>
    </tr>
  )
}

export function FileList() {
  const { currentPath, setCurrentPath, selectedFile, setSelectedFile } = useSelectionStore()

  // Fast query: get file list without commit info
  const { data: fastEntries, isLoading: fastLoading, error } = useTree(currentPath || undefined, false)

  // Slow query: get file list with commit info (runs in background)
  const { data: fullEntries } = useTree(currentPath || undefined, true)

  // Use full entries if available, otherwise use fast entries
  const entries = useMemo(() => {
    if (fullEntries) return fullEntries
    return fastEntries
  }, [fastEntries, fullEntries])

  const isLoading = fastLoading

  const handleNavigateUp = () => {
    if (!currentPath) return
    const parts = currentPath.split('/')
    parts.pop()
    setCurrentPath(parts.join('/'))
  }

  const handleEntryDoubleClick = (entry: TreeEntry) => {
    if (entry.entry_type === 'directory') {
      setCurrentPath(entry.path)
    }
  }

  const handleEntryClick = (entry: TreeEntry) => {
    if (entry.entry_type === 'file') {
      setSelectedFile(entry.path)
    } else {
      setSelectedFile(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Error loading files
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50">
        {currentPath && (
          <button
            onClick={handleNavigateUp}
            className="p-1 hover:bg-gray-200 rounded"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <span className="text-sm font-medium">
          {currentPath || 'Repository Root'}
        </span>
      </div>

      {/* File table */}
      <ScrollArea className="flex-1">
        <table className="w-full">
          <thead className="sticky top-0 bg-white border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">
                Name
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">
                Last Commit
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">
                Date
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">
                Size
              </th>
            </tr>
          </thead>
          <tbody>
            {entries?.map((entry) => (
              <FileRow
                key={entry.path}
                entry={entry}
                onDoubleClick={() => handleEntryDoubleClick(entry)}
                onClick={() => handleEntryClick(entry)}
                isSelected={selectedFile === entry.path}
              />
            ))}
          </tbody>
        </table>
        {entries?.length === 0 && (
          <div className="flex items-center justify-center py-8 text-gray-500">
            Empty directory
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
