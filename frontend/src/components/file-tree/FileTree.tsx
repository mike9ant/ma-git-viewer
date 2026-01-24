import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, GitBranch } from 'lucide-react'
import { useFullTree } from '@/api/hooks'
import { useSelectionStore } from '@/store/selectionStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { FullTreeEntry } from '@/api/types'

interface TreeNodeProps {
  entry: FullTreeEntry
  level: number
  expandedPaths: Set<string>
  toggleExpand: (path: string) => void
}

function TreeNode({ entry, level, expandedPaths, toggleExpand }: TreeNodeProps) {
  const { currentPath, setCurrentPath } = useSelectionStore()
  const isExpanded = expandedPaths.has(entry.path)
  const isDirectory = entry.entry_type === 'directory'
  const isSelected = currentPath === entry.path

  // Only show directories
  if (!isDirectory) return null

  // Filter children to only include directories
  const directoryChildren = entry.children?.filter(child => child.entry_type === 'directory')
  const hasSubfolders = directoryChildren && directoryChildren.length > 0

  const handleClick = () => {
    if (hasSubfolders) {
      toggleExpand(entry.path)
    }
    setCurrentPath(entry.path)
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
        {hasSubfolders ? (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {isExpanded && hasSubfolders ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-blue-500" />
        )}
        <span className="truncate">{entry.name}</span>
      </div>
      {isExpanded && hasSubfolders && (
        <div>
          {directoryChildren.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              level={level + 1}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
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
          <span>Repository Root</span>
        </div>
        {tree?.filter(entry => entry.entry_type === 'directory').map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            level={0}
            expandedPaths={expandedPaths}
            toggleExpand={toggleExpand}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
