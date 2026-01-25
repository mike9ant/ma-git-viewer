/**
 * API client - low-level fetch functions for backend communication.
 *
 * All functions accept an optional AbortSignal for request cancellation.
 * React Query automatically cancels in-flight requests when query keys change,
 * improving UI responsiveness when users navigate quickly.
 *
 * Functions map 1:1 to backend endpoints. Used by hooks in hooks.ts.
 */

import type {
  RepositoryInfo,
  TreeEntry,
  FullTreeEntry,
  CommitListResponse,
  DiffResponse,
  DirectoryInfo,
  DirectoryListing,
  BranchInfo,
  BlameResponse,
} from './types'

const API_BASE = '/api/v1'

/**
 * Fetch JSON with optional abort signal for request cancellation.
 * When the signal is aborted, the request is cancelled and an AbortError is thrown.
 */
async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(error.error || 'Request failed')
  }
  return response.json()
}

export const api = {
  getRepository: (signal?: AbortSignal) =>
    fetchJson<RepositoryInfo>(`${API_BASE}/repository`, signal),

  getTree: (path?: string, includeLastCommit = true, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    if (path) params.set('path', path)
    params.set('include_last_commit', String(includeLastCommit))
    return fetchJson<TreeEntry[]>(`${API_BASE}/repository/tree?${params}`, signal)
  },

  getFullTree: (signal?: AbortSignal) =>
    fetchJson<FullTreeEntry[]>(`${API_BASE}/repository/tree/full`, signal),

  getFileContent: (path: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ path })
    return fetchJson<string>(`${API_BASE}/repository/file?${params}`, signal)
  },

  getCommits: (path?: string, limit = 50, offset = 0, excludeAuthors?: string[], signal?: AbortSignal) => {
    const params = new URLSearchParams()
    if (path) params.set('path', path)
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    if (excludeAuthors && excludeAuthors.length > 0) {
      params.set('exclude_authors', excludeAuthors.join(','))
    }
    return fetchJson<CommitListResponse>(`${API_BASE}/repository/commits?${params}`, signal)
  },

  getDiff: (toCommit: string, fromCommit?: string, path?: string, excludeAuthors?: string[], signal?: AbortSignal) => {
    const params = new URLSearchParams({ to: toCommit })
    if (fromCommit) params.set('from', fromCommit)
    if (path) params.set('path', path)
    if (excludeAuthors && excludeAuthors.length > 0) {
      params.set('exclude_authors', excludeAuthors.join(','))
    }
    return fetchJson<DiffResponse>(`${API_BASE}/repository/diff?${params}`, signal)
  },

  getDirectoryInfo: (path?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    if (path) params.set('path', path)
    return fetchJson<DirectoryInfo>(`${API_BASE}/repository/directory-info?${params}`, signal)
  },

  listDirectory: (path?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    if (path) params.set('path', path)
    return fetchJson<DirectoryListing>(`${API_BASE}/filesystem/list?${params}`, signal)
  },

  switchRepository: async (path: string, signal?: AbortSignal): Promise<RepositoryInfo> => {
    const response = await fetch(`${API_BASE}/filesystem/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
      signal,
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.error || 'Request failed')
    }
    return response.json()
  },

  getBranches: (signal?: AbortSignal) =>
    fetchJson<BranchInfo[]>(`${API_BASE}/repository/branches`, signal),

  checkoutBranch: async (branch: string, signal?: AbortSignal): Promise<void> => {
    const response = await fetch(`${API_BASE}/repository/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
      signal,
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.error || 'Request failed')
    }
  },

  checkoutRemoteBranch: async (remoteBranch: string, localName: string, signal?: AbortSignal): Promise<void> => {
    const response = await fetch(`${API_BASE}/repository/checkout-remote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remote_branch: remoteBranch, local_name: localName }),
      signal,
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.error || 'Request failed')
    }
  },

  getBlame: (path: string, commit: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ path, commit })
    return fetchJson<BlameResponse>(`${API_BASE}/repository/blame?${params}`, signal)
  },
}
