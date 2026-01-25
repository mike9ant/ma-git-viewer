import type { AuthorInfo } from '@/api/types'

export interface AuthorFilterState {
  mode: 'IncludeAuthors' | 'ExcludeAuthors'
  authors: string[]  // email addresses
}

const STORAGE_KEY = 'git-viewer-author-filter'
const OLD_STORAGE_KEY = 'git-viewer-excluded-authors'

export const DEFAULT_AUTHOR_FILTER: AuthorFilterState = {
  mode: 'ExcludeAuthors',
  authors: []
}

export function loadAuthorFilter(): AuthorFilterState {
  try {
    // Try new format first
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.mode && Array.isArray(parsed.authors)) {
        return parsed
      }
    }

    // Try to migrate old format
    const oldStored = localStorage.getItem(OLD_STORAGE_KEY)
    if (oldStored) {
      const parsed = JSON.parse(oldStored)
      if (Array.isArray(parsed)) {
        const migrated: AuthorFilterState = { mode: 'ExcludeAuthors', authors: parsed }
        saveAuthorFilter(migrated)
        localStorage.removeItem(OLD_STORAGE_KEY)
        return migrated
      }
    }

    return DEFAULT_AUTHOR_FILTER
  } catch {
    return DEFAULT_AUTHOR_FILTER
  }
}

export function saveAuthorFilter(state: AuthorFilterState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/**
 * Convert the filter state to an exclusion list for the API.
 * In IncludeAuthors mode, computes all contributors not in the include list.
 */
export function getExcludedAuthorsForApi(
  filterState: AuthorFilterState,
  allContributors: AuthorInfo[]
): string[] | undefined {
  if (filterState.mode === 'ExcludeAuthors') {
    return filterState.authors.length > 0 ? filterState.authors : undefined
  } else {
    // IncludeAuthors mode: exclude everyone NOT in the include list
    const includeSet = new Set(filterState.authors)
    const excluded = allContributors
      .filter(c => !includeSet.has(c.email))
      .map(c => c.email)
    return excluded.length > 0 ? excluded : undefined
  }
}

/**
 * Check if an author is included (shown) based on the filter state.
 */
export function isAuthorIncluded(
  email: string,
  filterState: AuthorFilterState
): boolean {
  if (filterState.mode === 'IncludeAuthors') {
    return filterState.authors.includes(email)
  } else {
    return !filterState.authors.includes(email)
  }
}
