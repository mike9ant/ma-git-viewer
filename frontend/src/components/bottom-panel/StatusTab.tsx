/**
 * StatusTab - Directory statistics display.
 *
 * Shows for current directory:
 * - File and folder counts
 * - Total size
 * - Top contributors with commit counts
 * - First and latest commit dates
 *
 * Provides overview of directory without browsing individual files.
 */

import { useDirectoryInfo } from '@/api/hooks'
import { useSelectionStore } from '@/store/selectionStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatBytes } from '@/lib/utils'
import { Folder, File, Users, GitCommit, Calendar } from 'lucide-react'

export function StatusTab() {
  const { currentPath } = useSelectionStore()
  const { data: info, isLoading, error } = useDirectoryInfo(currentPath || undefined)

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
        Error loading directory info
      </div>
    )
  }

  if (!info) return null

  return (
    <ScrollArea className="h-full">
      <div className="p-4 grid gap-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <File className="h-5 w-5 text-gray-500" />
            <div>
              <div className="text-2xl font-semibold">{info.file_count}</div>
              <div className="text-xs text-gray-500">Files</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Folder className="h-5 w-5 text-blue-500" />
            <div>
              <div className="text-2xl font-semibold">{info.directory_count}</div>
              <div className="text-xs text-gray-500">Directories</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Users className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-2xl font-semibold">{info.contributors.length}</div>
              <div className="text-xs text-gray-500">Contributors</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="h-5 w-5 text-purple-500 text-sm font-bold">B</div>
            <div>
              <div className="text-2xl font-semibold">{formatBytes(info.total_size)}</div>
              <div className="text-xs text-gray-500">Total Size</div>
            </div>
          </div>
        </div>

        {/* Commit Info */}
        <div className="grid md:grid-cols-2 gap-4">
          {info.first_commit && (
            <div className="p-3 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">First Commit</span>
              </div>
              <div className="text-sm truncate">{info.first_commit.message}</div>
              <div className="text-xs text-gray-500 mt-1">
                {info.first_commit.author} - {info.first_commit.relative_time}
              </div>
            </div>
          )}
          {info.latest_commit && (
            <div className="p-3 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <GitCommit className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">Latest Commit</span>
              </div>
              <div className="text-sm truncate">{info.latest_commit.message}</div>
              <div className="text-xs text-gray-500 mt-1">
                {info.latest_commit.author} - {info.latest_commit.relative_time}
              </div>
            </div>
          )}
        </div>

        {/* Top Contributors */}
        {info.contributors.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Top Contributors</h3>
            <div className="space-y-2">
              {info.contributors.slice(0, 5).map((contributor) => (
                <div
                  key={contributor.email}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                >
                  <div>
                    <div className="text-sm font-medium">{contributor.name}</div>
                    <div className="text-xs text-gray-500">{contributor.email}</div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {contributor.commit_count} commits
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
