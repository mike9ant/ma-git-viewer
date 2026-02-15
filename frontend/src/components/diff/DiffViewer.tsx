/**
 * DiffViewer - Main diff display component with file list and code viewer.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────┐
 * │ Stats bar (files changed, +insertions, -deletions)│
 * ├──────────┬──────────────────────────────────────┤
 * │          │  File 1 header + diff                │
 * │  File    │  ──────────────────────────────────  │
 * │  List    │  File 2 header + diff                │
 * │ (toggle) │  ...                                 │
 * └──────────┴──────────────────────────────────────┘
 *
 * Features:
 * - Split (side-by-side) or unified diff view toggle
 * - Collapsible file sections (expand/collapse all)
 * - Compact mode for denser display
 * - Contributor filter (hide or gray out files by author)
 * - File list panel (toggleable) with scroll sync
 * - Author badges on each file showing who modified it
 *
 * Performance notes:
 * - All files rendered in DOM (no virtualization)
 * - FileDiffContent is memoized to prevent re-renders
 * - Collapsed files skip rendering diff content
 * - React Query caches diff data for instant revisits
 *
 * Makes 2 API calls: unfiltered (contributor list) + filtered (if applicable)
 */

import { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'
import { Panel, Group, Separator } from 'react-resizable-panels'
import { useDiff, useBlame } from '@/api/hooks'
import { useSettingsStore } from '@/store/settingsStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ContributorFilter } from '@/components/bottom-panel/ContributorFilter'
import { FileEdit, FilePlus, FileMinus, FileX2, Columns2, Rows2, PanelLeftClose, PanelLeft, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Rows3, Rows4, User, EyeOff, Eye, GitCommitHorizontal, Loader2, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileDiff, BlameLine } from '@/api/types'
import { WORKING_TREE } from '@/api/types'
import { loadAuthorFilter, saveAuthorFilter, getExcludedAuthorsForApi, type AuthorFilterState } from '@/utils/authorFilter'

function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`
  return `${Math.floor(diff / 31536000)}y ago`
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

// Tree node for file tree view
interface FileTreeNode {
  name: string                    // Display name (may be compressed path like "app/tools")
  children: FileTreeNode[]        // Child nodes
  fileIndex?: number              // Index in processedFiles if this is a file
  file?: FileDiff                 // File data if this is a leaf
  isDirectory: boolean
}

// Build a tree from flat file paths
function buildFileTree(files: FileDiff[]): FileTreeNode {
  const root: FileTreeNode = { name: '', children: [], isDirectory: true }

  files.forEach((file, index) => {
    const path = file.new_path || file.old_path || 'unknown'
    const parts = path.split('/')
    let current = root

    // Navigate/create directory nodes
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      let child = current.children.find(c => c.isDirectory && c.name === part)
      if (!child) {
        child = { name: part, children: [], isDirectory: true }
        current.children.push(child)
      }
      current = child
    }

    // Add file node
    const fileName = parts[parts.length - 1]
    current.children.push({
      name: fileName,
      children: [],
      fileIndex: index,
      file,
      isDirectory: false
    })
  })

  // Sort children: directories first, then files, both alphabetically
  const sortChildren = (node: FileTreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortChildren)
  }
  sortChildren(root)

  return root
}

// Compress single-child directory paths (e.g., app -> tools becomes app/tools)
function compressTree(node: FileTreeNode): FileTreeNode {
  // First, recursively compress children
  const compressedChildren = node.children.map(compressTree)

  // If this is a directory with exactly one child that is also a directory,
  // merge them into a single node
  if (node.isDirectory && compressedChildren.length === 1 && compressedChildren[0].isDirectory) {
    const child = compressedChildren[0]
    return {
      name: node.name ? `${node.name}/${child.name}` : child.name,
      children: child.children,
      isDirectory: true
    }
  }

  return {
    ...node,
    children: compressedChildren
  }
}

// Recursive tree node component
const FileTreeNodeComponent = memo(function FileTreeNodeComponent({
  node,
  depth,
  selectedFileIndex,
  grayedOutIndices,
  onFileClick
}: {
  node: FileTreeNode
  depth: number
  selectedFileIndex: number | null
  grayedOutIndices: Set<number>
  onFileClick: (index: number) => void
}) {
  // Directories are always expanded (as per requirement)
  if (node.isDirectory) {
    return (
      <>
        {/* Only show directory row if it has a name (not root) */}
        {node.name && (
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <FolderOpen className="h-3.5 w-3.5 text-yellow-600 shrink-0" />
            <span className="font-medium truncate">{node.name}</span>
          </div>
        )}
        {node.children.map((child, i) => (
          <FileTreeNodeComponent
            key={child.isDirectory ? `dir-${child.name}-${i}` : `file-${child.fileIndex}`}
            node={child}
            depth={node.name ? depth + 1 : depth}
            selectedFileIndex={selectedFileIndex}
            grayedOutIndices={grayedOutIndices}
            onFileClick={onFileClick}
          />
        ))}
      </>
    )
  }

  // File leaf node
  const isSelected = selectedFileIndex === node.fileIndex
  const isGrayedOut = node.fileIndex !== undefined && grayedOutIndices.has(node.fileIndex)

  return (
    <button
      onClick={() => node.fileIndex !== undefined && onFileClick(node.fileIndex)}
      className={cn(
        "w-full flex items-center gap-1.5 py-1 text-left hover:bg-gray-100 transition-colors",
        isSelected && "bg-blue-200 hover:bg-blue-200",
        isGrayedOut && "opacity-50"
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: '8px' }}
      title={node.file ? (node.file.new_path || node.file.old_path) : node.name}
    >
      {node.file && getStatusIcon(node.file.status)}
      <span className="text-xs font-mono truncate">{node.name}</span>
    </button>
  )
})

// Type for blame data passed to the diff content
interface BlameData {
  leftBlameMap: Map<number, BlameLine>
  rightBlameMap: Map<number, BlameLine>
  blameDisplayLines: Set<string>
  isLoading: boolean
}

// Hook to fetch and process blame data - only called when blame is enabled
function useBlameData(
  file: FileDiff,
  fromCommit: string | undefined,
  toCommit: string,
  collapsed: boolean
): BlameData {
  const leftPath = file.old_path || file.new_path || null
  const rightPath = file.new_path || file.old_path || null

  const isWorkingTree = toCommit === WORKING_TREE
  const { data: leftBlameData, isLoading: leftLoading } = useBlame(
    !collapsed && !isWorkingTree ? leftPath : null,
    !collapsed && !isWorkingTree ? (fromCommit || null) : null
  )
  const { data: rightBlameData, isLoading: rightLoading } = useBlame(
    !collapsed && !isWorkingTree ? rightPath : null,
    !collapsed && !isWorkingTree ? toCommit : null
  )

  const leftBlameMap = useMemo(() => {
    if (!leftBlameData) return new Map<number, BlameLine>()
    const map = new Map<number, BlameLine>()
    leftBlameData.lines.forEach(line => map.set(line.line_number, line))
    return map
  }, [leftBlameData])

  const rightBlameMap = useMemo(() => {
    if (!rightBlameData) return new Map<number, BlameLine>()
    const map = new Map<number, BlameLine>()
    rightBlameData.lines.forEach(line => map.set(line.line_number, line))
    return map
  }, [rightBlameData])

  const blameDisplayLines = useMemo(() => {
    if (!leftBlameData && !rightBlameData) return new Set<string>()
    const display = new Set<string>()

    const markFirstOfGroups = (blameMap: Map<number, BlameLine>, prefix: 'L' | 'R') => {
      const sortedLines = [...blameMap.entries()].sort((a, b) => a[0] - b[0])
      let lastAuthor: string | null = null
      for (const [lineNum, blame] of sortedLines) {
        if (blame.author_email !== lastAuthor) {
          display.add(`${prefix}:${lineNum}`)
          lastAuthor = blame.author_email
        }
      }
    }

    markFirstOfGroups(leftBlameMap, 'L')
    markFirstOfGroups(rightBlameMap, 'R')
    return display
  }, [leftBlameData, rightBlameData, leftBlameMap, rightBlameMap])

  return {
    leftBlameMap,
    rightBlameMap,
    blameDisplayLines,
    isLoading: leftLoading || rightLoading
  }
}

// Wrapper component that adds blame hooks - only rendered when blame is enabled
const FileDiffWithBlame = memo(function FileDiffWithBlame(props: {
  file: FileDiff
  splitView: boolean
  collapsed: boolean
  compact: boolean
  index: number
  isGrayedOut?: boolean
  onToggleCollapse: (index: number) => void
  onToggleBlame: (index: number) => void
  fromCommit: string | undefined
  toCommit: string
}) {
  const blameData = useBlameData(props.file, props.fromCommit, props.toCommit, props.collapsed)

  return (
    <FileDiffContentBase
      {...props}
      blameEnabled={true}
      blameData={blameData}
    />
  )
})

// Empty blame data for when blame is disabled
const emptyBlameData: BlameData = {
  leftBlameMap: new Map(),
  rightBlameMap: new Map(),
  blameDisplayLines: new Set(),
  isLoading: false
}

// Memoized component to prevent re-rendering heavy ReactDiffViewer when selection changes
const FileDiffContent = memo(function FileDiffContent(props: {
  file: FileDiff
  splitView: boolean
  collapsed: boolean
  compact: boolean
  index: number
  isGrayedOut?: boolean
  onToggleCollapse: (index: number) => void
  blameEnabled: boolean
  onToggleBlame: (index: number) => void
  fromCommit: string | undefined
  toCommit: string
}) {
  // When blame is enabled, render the wrapper that includes the hooks
  // When blame is disabled, render directly without hooks (zero overhead)
  if (props.blameEnabled) {
    return <FileDiffWithBlame {...props} />
  }

  return (
    <FileDiffContentBase
      {...props}
      blameData={emptyBlameData}
    />
  )
})

// Base component that renders the diff - no hooks, just presentation
const FileDiffContentBase = memo(function FileDiffContentBase({
  file,
  splitView,
  collapsed,
  compact,
  index,
  isGrayedOut,
  onToggleCollapse,
  blameEnabled,
  onToggleBlame,
  blameData
}: {
  file: FileDiff
  splitView: boolean
  collapsed: boolean
  compact: boolean
  index: number
  isGrayedOut?: boolean
  onToggleCollapse: (index: number) => void
  blameEnabled: boolean
  onToggleBlame: (index: number) => void
  blameData: BlameData
}) {
  const fileName = file.new_path || file.old_path || 'unknown'
  const authors = file.authors || []
  const { leftBlameMap, rightBlameMap, blameDisplayLines, isLoading: blameLoading } = blameData

  // Build tooltip with all authors
  const authorTooltip = authors.length > 0
    ? authors.map(a => `${a.name} (${a.commit_count} commit${a.commit_count > 1 ? 's' : ''}) - ${formatRelativeTime(a.last_commit_timestamp)}`).join('\n')
    : undefined

  // renderGutter callback for ReactDiffViewer
  const renderGutter = useCallback((data: {
    lineNumber: number
    type: number
    prefix: string
    value: string | unknown[]
    additionalLineNumber: number
    additionalPrefix: string
    styles: unknown
  }) => {
    const { lineNumber, prefix } = data
    const blameMap = prefix === 'L' ? leftBlameMap : rightBlameMap
    const key = `${prefix}:${lineNumber}`
    const blame = blameMap.get(lineNumber)

    if (!blame || !blameDisplayLines.has(key)) {
      return <span className="w-20 inline-block" />
    }

    const firstName = blame.author_name.split(' ')[0]
    const relTime = formatRelativeTime(blame.timestamp)

    return (
      <span
        className="text-[10px] text-gray-500 w-20 inline-block truncate px-1 font-mono"
        title={`${blame.author_name} - ${new Date(blame.timestamp * 1000).toLocaleDateString()}`}
      >
        {firstName} {relTime}
      </span>
    )
  }, [leftBlameMap, rightBlameMap, blameDisplayLines])

  return (
    <div className={cn(isGrayedOut && "opacity-50")}>
      {/* File header */}
      <div
        className={cn(
          "w-full flex items-center gap-2 px-4 bg-gray-50 border-b border-gray-200",
          compact ? "py-1" : "py-2"
        )}
      >
        <button
          onClick={() => onToggleCollapse(index)}
          className="flex items-center gap-2 hover:bg-gray-100 transition-colors cursor-pointer text-left flex-1 min-w-0"
        >
          {collapsed ? (
            <ChevronRight className={cn("text-gray-500 shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
          ) : (
            <ChevronDown className={cn("text-gray-500 shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
          )}
          {getStatusIcon(file.status)}
          <span className={cn("font-medium truncate", compact ? "text-xs" : "text-sm")}>{fileName}</span>
          {file.old_path && file.new_path && file.old_path !== file.new_path && (
            <span className={cn("text-gray-500 shrink-0", compact ? "text-[10px]" : "text-xs")}>
              (from {file.old_path})
            </span>
          )}
        </button>
        {authors.length > 0 && (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-purple-50 border border-purple-200 text-purple-700 shrink-0"
            title={authorTooltip}
          >
            <User className="h-3 w-3" />
            {authors.slice(0, 2).map((a, i) => (
              <span key={a.email}>
                {a.name.split(' ')[0]} ({a.commit_count} {a.commit_count === 1 ? 'commit' : 'commits'})
                {i < Math.min(authors.length, 2) - 1 && ','}
              </span>
            ))}
            {authors.length > 2 && <span className="text-purple-400">+{authors.length - 2}</span>}
            <span className="text-purple-500">
              · {formatRelativeTime(Math.max(...authors.map(a => a.last_commit_timestamp)))}
            </span>
          </span>
        )}
        {/* Blame toggle button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleBlame(index) }}
          className={cn(
            "p-1 rounded transition-colors shrink-0",
            blameEnabled
              ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
              : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          )}
          title={blameEnabled ? "Hide blame" : "Show blame"}
        >
          {blameLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <GitCommitHorizontal className="h-3.5 w-3.5" />
          )}
        </button>
        <span
          className={cn(
            "rounded shrink-0",
            compact ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
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
      {!collapsed && (
        file.is_binary ? (
          <div className={cn("text-gray-500", compact ? "p-2 text-xs" : "p-4 text-sm")}>
            Binary file not shown
          </div>
        ) : file.old_content !== undefined || file.new_content !== undefined ? (
          <div className={compact ? "text-[11px]" : "text-xs"}>
            <ReactDiffViewer
              oldValue={file.old_content || ''}
              newValue={file.new_content || ''}
              splitView={splitView}
              compareMethod={DiffMethod.LINES}
              useDarkTheme={false}
              renderGutter={blameEnabled && !blameLoading ? renderGutter : undefined}
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
                // Compact mode: override the default 25px line-height
                diffContainer: compact ? {
                  '& pre': {
                    lineHeight: '18px !important',
                  },
                } : undefined,
                gutter: compact ? {
                  padding: '0 5px',
                  minWidth: '30px',
                } : undefined,
              }}
            />
          </div>
        ) : (
          <div className={cn("text-gray-500", compact ? "p-2 text-xs" : "p-4 text-sm")}>
            No content available
          </div>
        )
      )}
    </div>
  )
})

export function DiffViewer({ toCommit, fromCommit, path }: DiffViewerProps) {
  const {
    diffFilePanelOpen: filePanelOpen,
    diffSplitView: splitView,
    diffFilesCollapsedByDefault,
    diffFilePanelSize: storedFilePanelSize,
    diffCompactMode: compactMode,
    diffFilterMode: filterMode,
    contributorFilterEnabled: filterEnabled,
    setDiffFilePanelOpen: setFilePanelOpen,
    setDiffSplitView: setSplitView,
    setDiffFilesCollapsedByDefault,
    setDiffFilePanelSize: setFilePanelSize,
    setDiffCompactMode: setCompactMode,
    setDiffFilterMode: setFilterMode,
    setContributorFilterEnabled: setFilterEnabled,
  } = useSettingsStore()

  // Ensure panel size is within valid bounds
  const filePanelSize = Math.max(10, Math.min(40, storedFilePanelSize || 20))

  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<number>>(new Set())
  const [filterState, setFilterState] = useState<AuthorFilterState>(() => loadAuthorFilter())
  const [blameEnabledFiles, setBlameEnabledFiles] = useState<Set<number>>(new Set())

  const filePanelRef = useRef<HTMLDivElement | null>(null)
  const selectedFileIndexRef = useRef<number | null>(null)
  const fileRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const visibilityMapRef = useRef<Map<number, number>>(new Map())
  const isUserScrollingRef = useRef(true)
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializedRef = useRef(false)

  // Save filter state to localStorage whenever it changes
  useEffect(() => {
    saveAuthorFilter(filterState)
  }, [filterState])

  // First fetch without filtering to get the contributor list for include mode conversion
  const { data: unfilteredDiff } = useDiff(toCommit, fromCommit, path, undefined)

  // Determine which authors to exclude based on filter state and mode
  const effectiveExcludedAuthors = useMemo(() => {
    if (!filterEnabled || filterMode !== 'hide') return undefined
    return getExcludedAuthorsForApi(filterState, unfilteredDiff?.contributors || [])
  }, [filterEnabled, filterMode, filterState, unfilteredDiff?.contributors])

  const { data: diff, isLoading, error } = useDiff(toCommit, fromCommit, path, effectiveExcludedAuthors)

  // Compute processed files for gray mode (filtering done client-side)
  const { processedFiles, grayedOutIndices } = useMemo(() => {
    if (!diff) return { processedFiles: [], grayedOutIndices: new Set<number>() }

    const files = diff.files
    const grayedOut = new Set<number>()

    if (filterEnabled && filterMode === 'gray') {
      const excludedForGray = getExcludedAuthorsForApi(filterState, unfilteredDiff?.contributors || [])
      if (excludedForGray && excludedForGray.length > 0) {
        const excludedSet = new Set(excludedForGray)
        files.forEach((file, index) => {
          const authors = file.authors || []
          // Gray out if ALL authors are excluded (or file has no authors)
          const allExcluded = authors.length === 0 ||
            authors.every(a => excludedSet.has(a.email))
          if (allExcluded) {
            grayedOut.add(index)
          }
        })
      }
    }

    return { processedFiles: files, grayedOutIndices: grayedOut }
  }, [diff, filterEnabled, filterMode, filterState, unfilteredDiff?.contributors])

  // Build file tree with path compression
  const fileTree = useMemo(() => {
    if (processedFiles.length === 0) return null
    const tree = buildFileTree(processedFiles)
    return compressTree(tree)
  }, [processedFiles])

  // Initialize collapsed state based on settings when diff loads
  useEffect(() => {
    if (diff && !initializedRef.current) {
      initializedRef.current = true
      if (diffFilesCollapsedByDefault) {
        setCollapsedFiles(new Set(diff.files.map((_, i) => i)))
      }
    }
  }, [diff, diffFilesCollapsedByDefault])

  const toggleFileCollapsed = useCallback((index: number) => {
    setCollapsedFiles(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const toggleBlame = useCallback((index: number) => {
    setBlameEnabledFiles(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const allCollapsed = processedFiles.length > 0 ? collapsedFiles.size === processedFiles.length : false

  const toggleAllCollapsed = () => {
    if (processedFiles.length === 0) return
    if (allCollapsed) {
      setCollapsedFiles(new Set())
      setDiffFilesCollapsedByDefault(false)
    } else {
      setCollapsedFiles(new Set(processedFiles.map((_, i) => i)))
      setDiffFilesCollapsedByDefault(true)
    }
  }

  // Keep ref in sync with state
  useEffect(() => {
    selectedFileIndexRef.current = selectedFileIndex
  }, [selectedFileIndex])

  // Reset refs array when files change
  useEffect(() => {
    if (processedFiles.length > 0) {
      fileRefs.current = fileRefs.current.slice(0, processedFiles.length)
      visibilityMapRef.current.clear()
    }
  }, [processedFiles])

  // Set up IntersectionObserver to track file visibility
  useEffect(() => {
    if (processedFiles.length === 0 || !scrollContainerRef.current) return

    const scrollContainer = scrollContainerRef.current

    const scheduleSelectionUpdate = () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }

      updateTimeoutRef.current = setTimeout(() => {
        if (!isUserScrollingRef.current) return

        const visibilityMap = visibilityMapRef.current
        const currentIndex = selectedFileIndexRef.current

        // Check if current selection is still mostly visible (>20%)
        if (currentIndex !== null && visibilityMap.has(currentIndex)) {
          const currentVisibility = visibilityMap.get(currentIndex) || 0
          if (currentVisibility > 0.2) {
            return
          }
        }

        // Find the file with best visibility
        let bestIndex: number | null = null
        let bestVisibility = 0

        visibilityMap.forEach((visibility, index) => {
          if (visibility > bestVisibility) {
            bestVisibility = visibility
            bestIndex = index
          }
        })

        if (bestIndex !== null && bestIndex !== selectedFileIndexRef.current) {
          setSelectedFileIndex(bestIndex)
        }
      }, 150)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = parseInt(entry.target.getAttribute('data-file-index') || '-1', 10)
          if (index >= 0) {
            visibilityMapRef.current.set(index, entry.intersectionRatio)
          }
        })
        scheduleSelectionUpdate()
      },
      {
        root: scrollContainer,
        threshold: [0, 0.25],
      }
    )

    // Observe all file elements
    fileRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref)
    })

    return () => {
      observer.disconnect()
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
    }
  }, [processedFiles])

  const scrollToFile = (index: number) => {
    isUserScrollingRef.current = false
    setSelectedFileIndex(index)
    fileRefs.current[index]?.scrollIntoView({ behavior: 'instant', block: 'start' })
    // Re-enable scroll-based selection after a short delay
    setTimeout(() => {
      isUserScrollingRef.current = true
    }, 1000)
  }

  // Calculate stats for shown files only (when filtering)
  // Must be before early returns to satisfy React hooks rules
  const hasActiveFilter = filterState.authors.length > 0 || filterState.mode === 'IncludeAuthors'
  const isFiltering = filterEnabled && hasActiveFilter
  const shownStats = useMemo(() => {
    if (!isFiltering || processedFiles.length === 0) return null

    let insertions = 0
    let deletions = 0

    processedFiles.forEach((file, index) => {
      // Skip grayed out files in gray mode
      if (filterMode === 'gray' && grayedOutIndices.has(index)) return

      const hunks = file.hunks || []
      hunks.forEach(hunk => {
        const lines = hunk.lines || []
        lines.forEach(line => {
          if (line.line_type === 'addition') insertions++
          else if (line.line_type === 'deletion') deletions++
        })
      })
    })

    return { insertions, deletions }
  }, [isFiltering, processedFiles, filterMode, grayedOutIndices])

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

  // Calculate display counts
  const totalFiles = diff.total_files ?? diff.files.length
  const displayedFiles = filterEnabled && filterMode === 'hide'
    ? (diff.filtered_files ?? diff.files.length)
    : (filterEnabled && filterMode === 'gray' ? processedFiles.length - grayedOutIndices.size : processedFiles.length)

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
        {isFiltering && shownStats && displayedFiles !== totalFiles ? (
          <span className="text-sm">
            <span className="font-medium">{displayedFiles}</span> shown
            {' '}(<span className="text-green-600">+{shownStats.insertions} insertions</span>{' '}
            <span className="text-red-600">-{shownStats.deletions} deletions</span>)
            <span className="text-gray-400"> of </span>
            {totalFiles} files
            {' '}(<span className="text-green-600">+{diff.stats.insertions}</span>{' '}
            <span className="text-red-600">-{diff.stats.deletions}</span>)
          </span>
        ) : (
          <>
            <span className="text-sm">
              <span className="font-medium">{diff.stats.files_changed}</span> files changed
            </span>
            <span className="text-sm text-green-600">
              +{diff.stats.insertions} insertions
            </span>
            <span className="text-sm text-red-600">
              -{diff.stats.deletions} deletions
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* Contributor Filter */}
          {unfilteredDiff?.contributors && unfilteredDiff.contributors.length > 0 && (
            <>
              <ContributorFilter
                contributors={unfilteredDiff?.contributors || []}
                filterState={filterState}
                filterEnabled={filterEnabled}
                onFilterEnabledChange={setFilterEnabled}
                onFilterStateChange={setFilterState}
              />
              {/* Filter mode toggle - only visible when filter is active */}
              {filterEnabled && hasActiveFilter && (
                <>
                  <div className="w-px h-4 bg-gray-300 mx-1" />
                  <Button
                    variant={filterMode === 'hide' ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setFilterMode('hide')}
                    className="h-7 px-2"
                    title="Hide filtered files"
                  >
                    <EyeOff className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={filterMode === 'gray' ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setFilterMode('gray')}
                    className="h-7 px-2"
                    title="Gray out filtered files"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </>
              )}
              <div className="w-px h-4 bg-gray-300 mx-1" />
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleAllCollapsed}
            className="h-7 px-2"
            title={allCollapsed ? "Expand all files" : "Collapse all files"}
          >
            {allCollapsed ? (
              <ChevronsUpDown className="h-4 w-4" />
            ) : (
              <ChevronsDownUp className="h-4 w-4" />
            )}
          </Button>
          <div className="w-px h-4 bg-gray-300 mx-1" />
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
          <div className="w-px h-4 bg-gray-300 mx-1" />
          <Button
            variant={compactMode ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setCompactMode(!compactMode)}
            className="h-7 px-2"
            title={compactMode ? "Comfortable view" : "Compact view"}
          >
            {compactMode ? (
              <Rows4 className="h-4 w-4" />
            ) : (
              <Rows3 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Main content with optional file panel */}
      {filePanelOpen ? (
        <Group
          orientation="horizontal"
          style={{ flex: 1, minHeight: 0 }}
          onLayoutChanged={(layout) => {
            // Only update state when drag ends for better performance
            const newSize = layout['diff-file-list']
            if (newSize !== undefined) {
              setFilePanelSize(newSize)
            }
          }}
        >
          {/* File list panel */}
          <Panel
            id="diff-file-list"
            defaultSize={`${filePanelSize}%`}
            minSize="10%"
            maxSize="40%"
          >
            <ScrollArea className="h-full border-r border-gray-200 bg-gray-50" ref={filePanelRef}>
              <div className="py-1">
                {fileTree && (
                  <FileTreeNodeComponent
                    node={fileTree}
                    depth={0}
                    selectedFileIndex={selectedFileIndex}
                    grayedOutIndices={grayedOutIndices}
                    onFileClick={scrollToFile}
                  />
                )}
              </div>
            </ScrollArea>
          </Panel>

          <Separator
            id="diff-panel-resize"
            className="resize-handle w-2"
            style={{ cursor: 'col-resize' }}
          />

          {/* Scrollable diff content */}
          <Panel id="diff-content" defaultSize={`${100 - filePanelSize}%`} minSize="30%">
            <ScrollArea className="h-full" viewportRef={scrollContainerRef}>
                <div className="p-4 space-y-6">
                  {processedFiles.map((file, index) => (
                    <div
                      key={index}
                      ref={(el) => { fileRefs.current[index] = el }}
                      data-file-index={index}
                      className={cn(
                        "border border-gray-200 rounded-lg overflow-hidden",
                        selectedFileIndex === index && "ring-2 ring-blue-400"
                      )}
                    >
                      <FileDiffContent
                        file={file}
                        splitView={splitView}
                        collapsed={collapsedFiles.has(index) || grayedOutIndices.has(index)}
                        compact={compactMode}
                        index={index}
                        isGrayedOut={grayedOutIndices.has(index)}
                        onToggleCollapse={toggleFileCollapsed}
                        blameEnabled={blameEnabledFiles.has(index)}
                        onToggleBlame={toggleBlame}
                        fromCommit={fromCommit}
                        toCommit={toCommit}
                      />
                    </div>
                  ))}

                  {processedFiles.length === 0 && (
                    <div className="flex items-center justify-center py-8 text-gray-500">
                      No changes in this diff
                    </div>
                  )}
                </div>
            </ScrollArea>
          </Panel>
        </Group>
      ) : (
        <ScrollArea className="flex-1 min-h-0" viewportRef={scrollContainerRef}>
            <div className="p-4 space-y-6">
              {processedFiles.map((file, index) => (
                <div
                  key={index}
                  ref={(el) => { fileRefs.current[index] = el }}
                  data-file-index={index}
                  className={cn(
                    "border border-gray-200 rounded-lg overflow-hidden",
                    selectedFileIndex === index && "ring-2 ring-blue-400"
                  )}
                >
                  <FileDiffContent
                    file={file}
                    splitView={splitView}
                    collapsed={collapsedFiles.has(index) || grayedOutIndices.has(index)}
                    compact={compactMode}
                    index={index}
                    isGrayedOut={grayedOutIndices.has(index)}
                    onToggleCollapse={toggleFileCollapsed}
                    blameEnabled={blameEnabledFiles.has(index)}
                    onToggleBlame={toggleBlame}
                    fromCommit={fromCommit}
                    toCommit={toCommit}
                  />
                </div>
              ))}

              {processedFiles.length === 0 && (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  No changes in this diff
                </div>
              )}
            </div>
        </ScrollArea>
      )}
    </div>
  )
}
