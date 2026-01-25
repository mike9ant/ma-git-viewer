/**
 * RepoSwitcher - Dropdown to browse filesystem and switch repositories.
 *
 * Located in header. Opens a popover showing:
 * - Current filesystem path with "go up" navigation
 * - List of subdirectories (git repos marked with special icon)
 *
 * Clicking a git repo switches the backend to serve that repository.
 * Clicking a regular folder navigates into it.
 * After switching, all queries are invalidated to refresh data.
 */

import * as React from 'react'
import { GitBranch, Folder, FolderGit, ChevronUp, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDirectoryListing, useSwitchRepository, useRepository } from '@/api/hooks'
import { cn } from '@/lib/utils'
import type { FilesystemEntry } from '@/api/types'

export function RepoSwitcher() {
  const [open, setOpen] = React.useState(false)
  const [currentPath, setCurrentPath] = React.useState<string | undefined>(undefined)

  const { data: repo } = useRepository()
  const { data: listing, isLoading } = useDirectoryListing(open ? currentPath : undefined)
  const switchRepo = useSwitchRepository()

  // Reset path when popover closes
  React.useEffect(() => {
    if (!open) {
      setCurrentPath(undefined)
    }
  }, [open])

  const handleNavigateUp = () => {
    if (listing?.parent_path) {
      setCurrentPath(listing.parent_path)
    }
  }

  const handleEntryClick = (entry: FilesystemEntry) => {
    if (entry.is_git_repo) {
      switchRepo.mutate(entry.path, {
        onSuccess: () => {
          setOpen(false)
          setCurrentPath(undefined)
        },
      })
    } else if (entry.is_directory) {
      setCurrentPath(entry.path)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <GitBranch className="h-5 w-5 text-gray-700" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Switch Repository</h4>
            {listing?.parent_path && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNavigateUp}
                className="h-6 px-2"
              >
                <ChevronUp className="h-4 w-4 mr-1" />
                Up
              </Button>
            )}
          </div>

          <div className="text-xs text-gray-500 truncate" title={listing?.current_path}>
            {listing?.current_path || 'Loading...'}
          </div>

          <ScrollArea className="h-64">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-1">
                {listing?.entries.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => handleEntryClick(entry)}
                    disabled={!entry.is_directory || switchRepo.isPending}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-left",
                      entry.is_git_repo && "font-medium",
                      entry.path === repo?.path && "bg-blue-50 text-blue-700",
                      !entry.is_directory && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {entry.is_git_repo ? (
                      <FolderGit className="h-4 w-4 text-orange-500 flex-shrink-0" />
                    ) : entry.is_directory ? (
                      <Folder className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <div className="h-4 w-4" />
                    )}
                    <span className="truncate">{entry.name}</span>
                    {entry.is_git_repo && (
                      <span className="ml-auto text-xs text-gray-400">git</span>
                    )}
                  </button>
                ))}
                {listing?.entries.length === 0 && (
                  <div className="text-sm text-gray-500 py-4 text-center">
                    No directories found
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {switchRepo.isPending && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Switching repository...
            </div>
          )}

          {switchRepo.isError && (
            <div className="text-sm text-red-500">
              Failed to switch: {switchRepo.error?.message}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
