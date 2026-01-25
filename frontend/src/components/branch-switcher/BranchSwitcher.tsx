/**
 * BranchSwitcher - Dropdown to view and switch git branches.
 *
 * Displays a clickable branch name that opens a popover with all branches.
 * Current branch is highlighted. Clicking a branch checks it out,
 * invalidating all cached data to reflect the new branch state.
 */

import * as React from 'react'
import { GitBranch, Check, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBranches, useCheckoutBranch, useRepository } from '@/api/hooks'
import { cn } from '@/lib/utils'

export function BranchSwitcher() {
  const [open, setOpen] = React.useState(false)

  const { data: repo } = useRepository()
  const { data: branches, isLoading } = useBranches()
  const checkout = useCheckoutBranch()

  const handleBranchClick = (branchName: string) => {
    if (branchName === repo?.head_branch) {
      setOpen(false)
      return
    }

    checkout.mutate(branchName, {
      onSuccess: () => {
        setOpen(false)
      },
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto py-0 px-1 text-xs text-gray-500 hover:text-gray-700 font-normal"
        >
          <GitBranch className="h-3 w-3 mr-1" />
          {repo?.head_branch || 'detached'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Switch Branch</h4>

          <ScrollArea className="h-64">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-1">
                {branches?.map((branch) => (
                  <button
                    key={branch.name}
                    onClick={() => handleBranchClick(branch.name)}
                    disabled={checkout.isPending}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-left",
                      branch.is_current && "bg-blue-50 text-blue-700 font-medium"
                    )}
                  >
                    <GitBranch className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate flex-1">{branch.name}</span>
                    {branch.is_current && (
                      <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    )}
                  </button>
                ))}
                {branches?.length === 0 && (
                  <div className="text-sm text-gray-500 py-4 text-center">
                    No branches found
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {checkout.isPending && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Switching branch...
            </div>
          )}

          {checkout.isError && (
            <div className="text-sm text-red-500">
              Failed to switch: {checkout.error?.message}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
