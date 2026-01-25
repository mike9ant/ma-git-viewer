/**
 * StatusTab - Directory/file statistics display.
 *
 * Shows for current path:
 * - File and folder counts (directories only)
 * - Total size
 * - Top contributors with commit counts
 * - First and latest commit dates
 *
 * Provides overview of path without browsing individual files.
 */

import { useDirectoryInfo, useCommits } from '@/api/hooks'
import { useSelectionStore } from '@/store/selectionStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatBytes } from '@/lib/utils'
import { Folder, File, Users, GitCommit, Calendar } from 'lucide-react'
import type { CommitInfo, CommitDetail } from '@/api/types'

// Helper to get author name from either CommitInfo or CommitDetail
function getAuthorName(commit: CommitInfo | CommitDetail): string {
  if (typeof commit.author === 'string') {
    return commit.author
  }
  return commit.author.name
}

export function StatusTab() {
  const { historyPath, currentPath } = useSelectionStore()
  const isFile = historyPath !== currentPath

  // For directories, use directoryInfo; for files, use commits to get contributor info
  const { data: dirInfo, isLoading: dirLoading, error: dirError } = useDirectoryInfo(
    isFile ? undefined : (historyPath || undefined)
  )
  const { data: commitsData, isLoading: commitsLoading, error: commitsError } = useCommits(
    historyPath || undefined, 50, 0, undefined
  )

  const isLoading = isFile ? commitsLoading : dirLoading
  const error = isFile ? commitsError : dirError

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
        Error loading info
      </div>
    )
  }

  // For files, derive info from commits data
  const commits = commitsData?.commits || []
  const firstCommit = isFile && commits.length > 0 ? commits[commits.length - 1] : dirInfo?.first_commit
  const latestCommit = isFile && commits.length > 0 ? commits[0] : dirInfo?.latest_commit
  const contributors = isFile ? commitsData?.contributors || [] : dirInfo?.contributors || []
  const totalCommits = commitsData?.total || 0

  if (!isFile && !dirInfo) return null
  if (isFile && !commitsData) return null

  return (
    <ScrollArea className="h-full">
      <div className="p-4 grid gap-6">
        {/* Stats */}
        <div className={`grid gap-4 ${isFile ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
          {!isFile && (
            <>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <File className="h-5 w-5 text-gray-500" />
                <div>
                  <div className="text-2xl font-semibold">{dirInfo?.file_count}</div>
                  <div className="text-xs text-gray-500">Files</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Folder className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-semibold">{dirInfo?.directory_count}</div>
                  <div className="text-xs text-gray-500">Directories</div>
                </div>
              </div>
            </>
          )}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Users className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-2xl font-semibold">{contributors.length}</div>
              <div className="text-xs text-gray-500">Contributors</div>
            </div>
          </div>
          {isFile ? (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <GitCommit className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-semibold">{totalCommits}</div>
                <div className="text-xs text-gray-500">Commits</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="h-5 w-5 text-purple-500 text-sm font-bold">B</div>
              <div>
                <div className="text-2xl font-semibold">{formatBytes(dirInfo?.total_size || 0)}</div>
                <div className="text-xs text-gray-500">Total Size</div>
              </div>
            </div>
          )}
        </div>

        {/* Commit Info */}
        <div className="grid md:grid-cols-2 gap-4">
          {firstCommit && (
            <div className="p-3 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">First Commit</span>
              </div>
              <div className="text-sm truncate">{firstCommit.message}</div>
              <div className="text-xs text-gray-500 mt-1">
                {getAuthorName(firstCommit)} - {firstCommit.relative_time}
              </div>
            </div>
          )}
          {latestCommit && (
            <div className="p-3 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <GitCommit className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">Latest Commit</span>
              </div>
              <div className="text-sm truncate">{latestCommit.message}</div>
              <div className="text-xs text-gray-500 mt-1">
                {getAuthorName(latestCommit)} - {latestCommit.relative_time}
              </div>
            </div>
          )}
        </div>

        {/* Top Contributors */}
        {contributors.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Top Contributors</h3>
            <div className="space-y-2">
              {contributors.slice(0, 5).map((contributor) => (
                <div
                  key={contributor.email}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                >
                  <div>
                    <div className="text-sm font-medium">{contributor.name}</div>
                    <div className="text-xs text-gray-500">{contributor.email}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
