import { useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { ChevronDown, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AuthorInfo } from '@/api/types'
import type { AuthorFilterState } from '@/utils/authorFilter'
import { isAuthorIncluded } from '@/utils/authorFilter'

interface ContributorFilterProps {
  contributors: AuthorInfo[]
  filterState: AuthorFilterState
  filterEnabled: boolean
  onFilterEnabledChange: (enabled: boolean) => void
  onFilterStateChange: (state: AuthorFilterState) => void
}

export function ContributorFilter({
  contributors,
  filterState,
  filterEnabled,
  onFilterEnabledChange,
  onFilterStateChange,
}: ContributorFilterProps) {
  const [open, setOpen] = useState(false)

  // Get authors in the filter list that are actually contributors to current folder
  const activeAuthors = filterState.authors.filter(email =>
    contributors.some(c => c.email === email)
  )

  const handleToggleAuthor = (email: string) => {
    const inList = filterState.authors.includes(email)
    if (inList) {
      // Remove from list
      onFilterStateChange({
        ...filterState,
        authors: filterState.authors.filter(e => e !== email)
      })
    } else {
      // Add to list
      onFilterStateChange({
        ...filterState,
        authors: [...filterState.authors, email]
      })
    }
  }

  const handleCheckAll = () => {
    // Switch to ExcludeAuthors mode with empty list (exclude nobody = show all)
    onFilterStateChange({ mode: 'ExcludeAuthors', authors: [] })
  }

  const handleUncheckAll = () => {
    // Switch to IncludeAuthors mode with empty list (include nobody = show none)
    onFilterStateChange({ mode: 'IncludeAuthors', authors: [] })
  }

  const getDisplayText = () => {
    // In IncludeAuthors mode, always show the include indicator
    if (filterState.mode === 'IncludeAuthors') {
      if (activeAuthors.length === 0) {
        return '+ 0 users'
      }
      if (activeAuthors.length === 1) {
        const contributor = contributors.find(c => c.email === activeAuthors[0])
        return `+${contributor?.name || 'Unknown'}`
      }
      return `+ ${activeAuthors.length} users`
    } else {
      // ExcludeAuthors mode
      if (activeAuthors.length === 0) {
        return 'Filter'
      }
      if (activeAuthors.length === 1) {
        const contributor = contributors.find(c => c.email === activeAuthors[0])
        return `-${contributor?.name || 'Unknown'}`
      }
      return `- ${activeAuthors.length} users`
    }
  }

  const getButtonStyle = () => {
    // In IncludeAuthors mode, always show green (even with 0 users)
    if (filterState.mode === 'IncludeAuthors') {
      return 'text-green-600 border-green-300'
    }
    // In ExcludeAuthors mode, only show red when there are exclusions
    if (activeAuthors.length > 0) {
      return 'text-red-600 border-red-300'
    }
    return ''
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
              getButtonStyle()
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
                  const included = isAuthorIncluded(contributor.email, filterState)
                  return (
                    <label
                      key={contributor.email}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <Checkbox
                        checked={included}
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
