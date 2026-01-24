import type {
  RepositoryInfo,
  TreeEntry,
  FullTreeEntry,
  CommitListResponse,
  DiffResponse,
  DirectoryInfo,
  DirectoryListing,
} from './types'

const API_BASE = '/api/v1'

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(error.error || 'Request failed')
  }
  return response.json()
}

export const api = {
  getRepository: () =>
    fetchJson<RepositoryInfo>(`${API_BASE}/repository`),

  getTree: (path?: string, includeLastCommit = true) => {
    const params = new URLSearchParams()
    if (path) params.set('path', path)
    params.set('include_last_commit', String(includeLastCommit))
    return fetchJson<TreeEntry[]>(`${API_BASE}/repository/tree?${params}`)
  },

  getFullTree: () =>
    fetchJson<FullTreeEntry[]>(`${API_BASE}/repository/tree/full`),

  getFileContent: (path: string) => {
    const params = new URLSearchParams({ path })
    return fetchJson<string>(`${API_BASE}/repository/file?${params}`)
  },

  getCommits: (path?: string, limit = 50, offset = 0, excludeAuthors?: string[]) => {
    const params = new URLSearchParams()
    if (path) params.set('path', path)
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    if (excludeAuthors && excludeAuthors.length > 0) {
      params.set('exclude_authors', excludeAuthors.join(','))
    }
    return fetchJson<CommitListResponse>(`${API_BASE}/repository/commits?${params}`)
  },

  getDiff: (toCommit: string, fromCommit?: string, path?: string) => {
    const params = new URLSearchParams({ to: toCommit })
    if (fromCommit) params.set('from', fromCommit)
    if (path) params.set('path', path)
    return fetchJson<DiffResponse>(`${API_BASE}/repository/diff?${params}`)
  },

  getDirectoryInfo: (path?: string) => {
    const params = new URLSearchParams()
    if (path) params.set('path', path)
    return fetchJson<DirectoryInfo>(`${API_BASE}/repository/directory-info?${params}`)
  },

  listDirectory: (path?: string) => {
    const params = new URLSearchParams()
    if (path) params.set('path', path)
    return fetchJson<DirectoryListing>(`${API_BASE}/filesystem/list?${params}`)
  },

  switchRepository: async (path: string): Promise<RepositoryInfo> => {
    const response = await fetch(`${API_BASE}/filesystem/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.error || 'Request failed')
    }
    return response.json()
  },
}
