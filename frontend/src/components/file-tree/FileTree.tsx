import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, File, GitBranch } from 'lucide-react'
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
  const { currentPath, setCurrentPath, setSelectedFile } = useSelectionStore()
  const isExpanded = expandedPaths.has(entry.path)
  const isDirectory = entry.entry_type === 'directory'
  const isSelected = currentPath === entry.path

  const handleClick = () => {
    if (isDirectory) {
      toggleExpand(entry.path)
      setCurrentPath(entry.path)
    } else {
      setSelectedFile(entry.path)
    }
  }

  const handleDoubleClick = () => {
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
        onDoubleClick={handleDoubleClick}
      >
        {isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-blue-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <File className="h-4 w-4 shrink-0 text-gray-500" />
          </>
        )}
        <span className="truncate">{entry.name}</span>
      </div>
      {isDirectory && isExpanded && entry.children && (
        <div>
          {entry.children.map((child) => (
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
        {tree?.map((entry) => (
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
