import { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'
import { Panel, Group, Separator } from 'react-resizable-panels'
import { useDiff } from '@/api/hooks'
import { useSettingsStore } from '@/store/settingsStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ContributorFilter } from '@/components/bottom-panel/ContributorFilter'
import { FileEdit, FilePlus, FileMinus, FileX2, Columns2, Rows2, PanelLeftClose, PanelLeft, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Rows3, Rows4, User, EyeOff, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileDiff } from '@/api/types'

const DIFF_EXCLUDED_AUTHORS_KEY = 'git-viewer-diff-excluded-authors'

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

// Memoized component to prevent re-rendering heavy ReactDiffViewer when selection changes
const FileDiffContent = memo(function FileDiffContent({
  file,
  splitView,
  collapsed,
  compact,
  index,
  isGrayedOut,
  onToggleCollapse
}: {
  file: FileDiff
  splitView: boolean
  collapsed: boolean
  compact: boolean
  index: number
  isGrayedOut?: boolean
  onToggleCollapse: (index: number) => void
}) {
  const fileName = file.new_path || file.old_path || 'unknown'
  const authors = file.authors || []
  const biggestAuthor = authors.length > 0 ? authors[0] : null

  // Build tooltip with all authors
  const authorTooltip = authors.length > 0
    ? authors.map(a => `${a.name} (${a.commit_count} commit${a.commit_count > 1 ? 's' : ''}) - ${formatRelativeTime(a.last_commit_timestamp)}`).join('\n')
    : undefined

  return (
    <div className={cn(isGrayedOut && "opacity-50")}>
      {/* File header */}
      <button
        onClick={() => onToggleCollapse(index)}
        className={cn(
          "w-full flex items-center gap-2 px-4 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer text-left",
          compact ? "py-1" : "py-2"
        )}
      >
        {collapsed ? (
          <ChevronRight className={cn("text-gray-500 shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        ) : (
          <ChevronDown className={cn("text-gray-500 shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        )}
        {getStatusIcon(file.status)}
        <span className={cn("font-medium", compact ? "text-xs" : "text-sm")}>{fileName}</span>
        {file.old_path && file.new_path && file.old_path !== file.new_path && (
          <span className={cn("text-gray-500", compact ? "text-[10px]" : "text-xs")}>
            (from {file.old_path})
          </span>
        )}
        {biggestAuthor && (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-purple-50 border border-purple-200 text-purple-700"
            title={authorTooltip}
          >
            <User className="h-3 w-3" />
            {biggestAuthor.name.split(' ')[0]}
            <span className="text-purple-500">
              ({biggestAuthor.commit_count} {biggestAuthor.commit_count === 1 ? 'commit' : 'commits'}) · {formatRelativeTime(biggestAuthor.last_commit_timestamp)}
            </span>
            {authors.length > 1 && <span className="text-purple-400">+{authors.length - 1}</span>}
          </span>
        )}
        <span
          className={cn(
            "ml-auto rounded",
            compact ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
            file.status === 'added' && "bg-green-100 text-green-700",
            file.status === 'deleted' && "bg-red-100 text-red-700",
            file.status === 'modified' && "bg-yellow-100 text-yellow-700",
            file.status === 'renamed' && "bg-blue-100 text-blue-700"
          )}
        >
          {getStatusLabel(file.status)}
        </span>
      </button>

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
    setDiffFilePanelOpen: setFilePanelOpen,
    setDiffSplitView: setSplitView,
    setDiffFilesCollapsedByDefault,
    setDiffFilePanelSize: setFilePanelSize,
    setDiffCompactMode: setCompactMode,
    setDiffFilterMode: setFilterMode,
  } = useSettingsStore()

  // Ensure panel size is within valid bounds
  const filePanelSize = Math.max(10, Math.min(40, storedFilePanelSize || 20))

  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<number>>(new Set())
  const [filePanelWidthPx, setFilePanelWidthPx] = useState<number>(200)
  const [filterEnabled, setFilterEnabled] = useState(false)
  const [excludedAuthors, setExcludedAuthors] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(DIFF_EXCLUDED_AUTHORS_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  const filePanelRef = useRef<HTMLDivElement | null>(null)
  const selectedFileIndexRef = useRef<number | null>(null)
  const fileRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const visibilityMapRef = useRef<Map<number, number>>(new Map())
  const isUserScrollingRef = useRef(true)
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializedRef = useRef(false)

  // Determine which authors to exclude based on filter state and mode
  const effectiveExcludedAuthors = filterEnabled && filterMode === 'hide' ? excludedAuthors : undefined
  const { data: diff, isLoading, error } = useDiff(toCommit, fromCommit, path, effectiveExcludedAuthors)

  // Save excluded authors to localStorage
  useEffect(() => {
    localStorage.setItem(DIFF_EXCLUDED_AUTHORS_KEY, JSON.stringify(excludedAuthors))
  }, [excludedAuthors])

  // Compute processed files for gray mode (filtering done client-side)
  const { processedFiles, grayedOutIndices } = useMemo(() => {
    if (!diff) return { processedFiles: [], grayedOutIndices: new Set<number>() }

    const files = diff.files
    const grayedOut = new Set<number>()

    if (filterEnabled && filterMode === 'gray' && excludedAuthors.length > 0) {
      files.forEach((file, index) => {
        const authors = file.authors || []
        // Gray out if ALL authors are excluded (or file has no authors)
        const allExcluded = authors.length === 0 ||
          authors.every(a => excludedAuthors.includes(a.email))
        if (allExcluded) {
          grayedOut.add(index)
        }
      })
    }

    return { processedFiles: files, grayedOutIndices: grayedOut }
  }, [diff, filterEnabled, filterMode, excludedAuthors])

  // Initialize collapsed state based on settings when diff loads
  useEffect(() => {
    if (diff && !initializedRef.current) {
      initializedRef.current = true
      if (diffFilesCollapsedByDefault) {
        setCollapsedFiles(new Set(diff.files.map((_, i) => i)))
      }
    }
  }, [diff, diffFilesCollapsedByDefault])

  // Measure initial file panel width
  useEffect(() => {
    if (filePanelRef.current) {
      setFilePanelWidthPx(filePanelRef.current.offsetWidth)
    }
  }, [filePanelOpen])

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
  const isFiltering = filterEnabled && excludedAuthors.length > 0

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
          {isFiltering ? (
            <>
              <span className="font-medium">{displayedFiles}</span>
              <span className="text-gray-500"> of {totalFiles}</span> files
            </>
          ) : (
            <>
              <span className="font-medium">{diff.stats.files_changed}</span> files changed
            </>
          )}
        </span>
        <span className="text-sm text-green-600">
          +{diff.stats.insertions} insertions
        </span>
        <span className="text-sm text-red-600">
          -{diff.stats.deletions} deletions
        </span>
        <div className="ml-auto flex items-center gap-1">
          {/* Contributor Filter */}
          {diff.contributors && diff.contributors.length > 0 && (
            <>
              <ContributorFilter
                contributors={diff.contributors}
                excludedAuthors={excludedAuthors}
                filterEnabled={filterEnabled}
                onFilterEnabledChange={setFilterEnabled}
                onExcludedAuthorsChange={setExcludedAuthors}
              />
              {/* Filter mode toggle - only visible when filter is active */}
              {filterEnabled && diff.contributors && excludedAuthors.some(e => diff.contributors.some(c => c.email === e)) && (
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
            // Measure actual pixel width after layout settles
            requestAnimationFrame(() => {
              if (filePanelRef.current) {
                setFilePanelWidthPx(filePanelRef.current.offsetWidth)
              }
            })
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
              <div className="py-2">
                {processedFiles.map((file, index) => {
                  const fileName = file.new_path || file.old_path || 'unknown'
                  // Calculate max chars: panel width minus padding (24px), icon (16px), gap (8px)
                  // Divide by ~7.2px per character for text-xs monospace font
                  const maxChars = Math.max(15, Math.floor((filePanelWidthPx - 48) / 7.2))
                  const displayName = abbreviateFilename(fileName, maxChars)
                  const isGrayedOut = grayedOutIndices.has(index)

                  return (
                    <button
                      key={index}
                      onClick={() => scrollToFile(index)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 transition-colors",
                        selectedFileIndex === index && "bg-blue-200 hover:bg-blue-200",
                        isGrayedOut && "opacity-50"
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
