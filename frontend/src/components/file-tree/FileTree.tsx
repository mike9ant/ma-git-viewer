import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, GitBranch, File, FolderTree } from 'lucide-react'
import { useFullTree } from '@/api/hooks'
import { useSelectionStore } from '@/store/selectionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FullTreeEntry } from '@/api/types'

interface TreeNodeProps {
  entry: FullTreeEntry
  level: number
  expandedPaths: Set<string>
  toggleExpand: (path: string) => void
  showFiles: boolean
}

function TreeNode({ entry, level, expandedPaths, toggleExpand, showFiles }: TreeNodeProps) {
  const { currentPath, setCurrentPath } = useSelectionStore()
  const isExpanded = expandedPaths.has(entry.path)
  const isDirectory = entry.entry_type === 'directory'
  const isSelected = currentPath === entry.path

  // Only show files if showFiles is enabled
  if (!isDirectory && !showFiles) return null

  // Filter children based on showFiles setting
  const directoryChildren = entry.children?.filter(child => child.entry_type === 'directory')
  const fileChildren = showFiles ? entry.children?.filter(child => child.entry_type === 'file') : []
  const visibleChildren = [...(directoryChildren || []), ...(fileChildren || [])]
  const hasVisibleChildren = visibleChildren.length > 0
  const canExpand = isDirectory && hasVisibleChildren

  const handleClick = () => {
    if (canExpand) {
      toggleExpand(entry.path)
    }
    if (isDirectory) {
      setCurrentPath(entry.path)
    }
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-100 rounded-sm text-sm",
          isSelected && "bg-gray-100"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {isDirectory ? (
          canExpand ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
            )
          ) : (
            <span className="w-4 shrink-0" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {isDirectory ? (
          isExpanded && hasVisibleChildren ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-blue-500" />
          )
        ) : (
          <File className="h-4 w-4 shrink-0 text-gray-500" />
        )}
        <span className="truncate">{entry.name}</span>
      </div>
      {isExpanded && hasVisibleChildren && (
        <div>
          {visibleChildren.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              level={level + 1}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              showFiles={showFiles}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree() {
  const { data: tree, isLoading, error } = useFullTree()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const { setCurrentPath } = useSelectionStore()
  const { fileTreeShowFiles, setFileTreeShowFiles } = useSettingsStore()

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleRootClick = () => {
    setCurrentPath('')
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
      <div className="flex items-center justify-center h-full text-red-500 p-4">
        Error loading tree
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <div
          className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-gray-100 rounded-sm text-sm font-medium"
          onClick={handleRootClick}
        >
          <GitBranch className="h-4 w-4 text-gray-500" />
          <span className="flex-1">Repository Root</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation()
              setFileTreeShowFiles(!fileTreeShowFiles)
            }}
            title={fileTreeShowFiles ? "Hide files" : "Show files"}
          >
            <FolderTree className={cn("h-4 w-4", fileTreeShowFiles ? "text-blue-500" : "text-gray-400")} />
          </Button>
        </div>
        {tree?.filter(entry => entry.entry_type === 'directory' || fileTreeShowFiles).map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            level={0}
            expandedPaths={expandedPaths}
            toggleExpand={toggleExpand}
            showFiles={fileTreeShowFiles}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
