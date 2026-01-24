import { useState, useEffect } from 'react'
import { useCommits } from '@/api/hooks'
import { useSelectionStore } from '@/store/selectionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { GitCommit, GitCompare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContributorFilter } from './ContributorFilter'

const STORAGE_KEY = 'git-viewer-excluded-authors'

function loadExcludedAuthors(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveExcludedAuthors(authors: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(authors))
}

export function HistoryTab() {
  const { currentPath, selectedCommits, toggleCommitSelection, clearCommitSelection, openDiffModal } = useSelectionStore()
  const { compactMode } = useSettingsStore()
  const [filterEnabled, setFilterEnabled] = useState(false)
  const [excludedAuthors, setExcludedAuthors] = useState<string[]>(() => loadExcludedAuthors())

  // Save excluded authors to localStorage whenever they change
  useEffect(() => {
    saveExcludedAuthors(excludedAuthors)
  }, [excludedAuthors])

  const { data, isLoading, error } = useCommits(
    currentPath || undefined,
    50,
    0,
    filterEnabled && excludedAuthors.length > 0 ? excludedAuthors : undefined
  )

  const getCommitTimestamp = (oid: string) => {
    return data?.commits.find(c => c.oid === oid)?.timestamp ?? null
  }

  const formatTimeDiff = () => {
    if (selectedCommits.length !== 2) return null
    const [fromOid, toOid] = selectedCommits
    const fromTs = getCommitTimestamp(fromOid)
    const toTs = getCommitTimestamp(toOid)
    if (fromTs === null || toTs === null) return null

    const diffSeconds = toTs - fromTs
    const diffHours = diffSeconds / 3600
    const diffDays = diffHours / 24

    const sign = diffSeconds >= 0 ? '+' : ''

    if (Math.abs(diffHours) < 24) {
      return `(${sign}${diffHours.toFixed(1)} hr)`
    } else {
      return `(${sign}${diffDays.toFixed(1)} days)`
    }
  }

  const handleCompare = () => {
    if (selectedCommits.length === 2) {
      const [from, to] = selectedCommits
      openDiffModal(from, to, getCommitTimestamp(from), getCommitTimestamp(to))
    } else if (selectedCommits.length === 1) {
      openDiffModal(null, selectedCommits[0], null, getCommitTimestamp(selectedCommits[0]))
    }
  }

  const handleCompareWithCurrent = (commitOid: string) => {
    if (data?.commits[0]) {
      const headCommit = data.commits[0]
      openDiffModal(commitOid, headCommit.oid, getCommitTimestamp(commitOid), headCommit.timestamp)
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
        Error loading commits
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Actions bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <ContributorFilter
            contributors={data?.contributors || []}
            excludedAuthors={excludedAuthors}
            filterEnabled={filterEnabled}
            onFilterEnabledChange={setFilterEnabled}
            onExcludedAuthorsChange={setExcludedAuthors}
          />
          <span className="text-sm text-gray-500">
            {data?.filtered_total !== data?.total && data?.filtered_total !== undefined
              ? `${data?.filtered_total} of ${data?.total} commits`
              : `${data?.total} commits`}
            {currentPath && ` affecting ${currentPath}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selectedCommits.length > 0 && (
            <>
              <span className="text-sm text-gray-500">
                {selectedCommits.length} selected
                {formatTimeDiff() && (
                  <span className="ml-1">{formatTimeDiff()}</span>
                )}
              </span>
              <Button variant="outline" size="sm" onClick={clearCommitSelection}>
                Clear
              </Button>
              <Button size="sm" onClick={handleCompare} disabled={selectedCommits.length === 0}>
                <GitCompare className="h-4 w-4 mr-1" />
                Compare
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Commits list */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-gray-200">
          {data?.commits.map((commit, index) => {
            const selectionIndex = selectedCommits.indexOf(commit.oid)
            const isSelected = selectionIndex !== -1
            const isLatest = index === 0

            return (
              <div
                key={commit.oid}
                className={cn(
                  "flex items-start gap-3 px-4 hover:bg-gray-50",
                  compactMode ? "py-1.5 gap-2" : "py-3",
                  isSelected && "bg-blue-50"
                )}
              >
                <button
                  onClick={() => toggleCommitSelection(commit.oid)}
                  className={cn(
                    "shrink-0 rounded-sm border font-medium flex items-center justify-center",
                    compactMode ? "mt-0.5 h-3.5 w-3.5 text-[10px]" : "mt-1 h-4 w-4 text-xs",
                    isSelected
                      ? "bg-gray-900 text-white border-gray-900"
                      : "border-gray-400 hover:border-gray-500"
                  )}
                >
                  {isSelected ? selectionIndex + 1 : ''}
                </button>
                <GitCommit className={cn("text-gray-500 shrink-0", compactMode ? "h-3.5 w-3.5 mt-0.5" : "h-4 w-4 mt-1")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("font-medium truncate", compactMode ? "text-xs" : "text-sm")}>
                      {commit.message.split('\n')[0]}
                    </span>
                    {isLatest && (
                      <span className={cn("bg-green-100 text-green-700 rounded", compactMode ? "px-1 py-0 text-[10px]" : "px-1.5 py-0.5 text-xs")}>
                        HEAD
                      </span>
                    )}
                  </div>
                  <div className={cn("flex items-center gap-4", compactMode ? "mt-0.5 gap-3" : "mt-1")}>
                    <span className={cn("text-gray-500", compactMode ? "text-[11px]" : "text-xs")}>
                      {new Date(commit.timestamp * 1000).toLocaleDateString()}
                    </span>
                    <span className={cn("text-gray-500 font-mono", compactMode ? "text-[11px]" : "text-xs")}>
                      {commit.oid.substring(0, 7)}
                    </span>
                    <span className={cn("text-gray-500", compactMode ? "text-[11px]" : "text-xs")}>
                      {commit.author.name}
                    </span>
                    <span className={cn("text-gray-500", compactMode ? "text-[11px]" : "text-xs")}>
                      {commit.relative_time}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(compactMode ? "text-[11px] h-6 px-2" : "text-xs")}
                    onClick={() => openDiffModal(null, commit.oid, null, commit.timestamp)}
                  >
                    View
                  </Button>
                  {!isLatest && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(compactMode ? "text-[11px] h-6 px-2" : "text-xs")}
                      onClick={() => handleCompareWithCurrent(commit.oid)}
                    >
                      vs HEAD
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {data?.has_more && (
          <div className="flex justify-center py-4">
            <Button variant="outline" size="sm">
              Load more
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
