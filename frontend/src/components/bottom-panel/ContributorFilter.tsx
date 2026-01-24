import { useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { ChevronDown, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AuthorInfo } from '@/api/types'

interface ContributorFilterProps {
  contributors: AuthorInfo[]
  excludedAuthors: string[]
  filterEnabled: boolean
  onFilterEnabledChange: (enabled: boolean) => void
  onExcludedAuthorsChange: (emails: string[]) => void
}

export function ContributorFilter({
  contributors,
  excludedAuthors,
  filterEnabled,
  onFilterEnabledChange,
  onExcludedAuthorsChange,
}: ContributorFilterProps) {
  const [open, setOpen] = useState(false)

  // Get excluded authors that are actually contributors to current folder
  const activeExcluded = excludedAuthors.filter(email =>
    contributors.some(c => c.email === email)
  )

  const handleToggleAuthor = (email: string) => {
    if (excludedAuthors.includes(email)) {
      onExcludedAuthorsChange(excludedAuthors.filter(e => e !== email))
    } else {
      onExcludedAuthorsChange([...excludedAuthors, email])
    }
  }

  const handleCheckAll = () => {
    // Remove all current folder's contributors from excluded list
    const contributorEmails = new Set(contributors.map(c => c.email))
    onExcludedAuthorsChange(excludedAuthors.filter(e => !contributorEmails.has(e)))
  }

  const handleUncheckAll = () => {
    // Add all current folder's contributors to excluded list
    const contributorEmails = contributors.map(c => c.email)
    const newExcluded = new Set([...excludedAuthors, ...contributorEmails])
    onExcludedAuthorsChange(Array.from(newExcluded))
  }

  const getDisplayText = () => {
    if (activeExcluded.length === 0) {
      return 'Filter'
    }
    if (activeExcluded.length === 1) {
      const contributor = contributors.find(c => c.email === activeExcluded[0])
      return `-${contributor?.name || 'Unknown'}`
    }
    return `-${activeExcluded.length} users`
  }

  return (
    <div className="flex items-center gap-1">
      {/* Toggle button */}
      <button
        onClick={() => onFilterEnabledChange(!filterEnabled)}
        className={cn(
          "h-6 w-6 rounded flex items-center justify-center transition-colors",
          filterEnabled
            ? "bg-gray-900 text-white hover:bg-gray-800"
            : "bg-gray-200 text-gray-500 hover:bg-gray-300"
        )}
        title={filterEnabled ? "Disable author filter" : "Enable author filter"}
      >
        <Filter className="h-3.5 w-3.5" />
      </button>

      {/* Dropdown */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-6 px-2 text-xs gap-1",
              activeExcluded.length > 0 && "text-orange-600 border-orange-300"
            )}
          >
            {getDisplayText()}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
            <span className="text-sm font-medium">Filter by author ({contributors.length} total)</span>
            <div className="flex gap-1">
              <button
                onClick={handleCheckAll}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                All
              </button>
              <span className="text-xs text-gray-400">|</span>
              <button
                onClick={handleUncheckAll}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                None
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <div className="p-2">
              {contributors.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">
                  No contributors
                </div>
              ) : (
                contributors.map((contributor) => {
                  const isIncluded = !excludedAuthors.includes(contributor.email)
                  return (
                    <label
                      key={contributor.email}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <Checkbox
                        checked={isIncluded}
                        onCheckedChange={() => handleToggleAuthor(contributor.email)}
                      />
                      <span className="text-sm truncate flex-1">
                        {contributor.name}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
