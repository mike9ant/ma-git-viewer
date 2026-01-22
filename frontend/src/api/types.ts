export interface CommitInfo {
  oid: string
  message: string
  author: string
  timestamp: number
  relative_time: string
}

export interface TreeEntry {
  name: string
  path: string
  entry_type: 'file' | 'directory' | 'symlink' | 'submodule'
  size?: number
  last_commit?: CommitInfo
}

export interface FullTreeEntry {
  name: string
  path: string
  entry_type: 'file' | 'directory' | 'symlink' | 'submodule'
  children?: FullTreeEntry[]
}

export interface RepositoryInfo {
  name: string
  path: string
  head_branch?: string
  head_commit?: CommitInfo
  is_bare: boolean
  is_empty: boolean
}

export interface DirectoryInfo {
  path: string
  file_count: number
  directory_count: number
  total_size: number
  contributors: ContributorInfo[]
  first_commit?: CommitInfo
  latest_commit?: CommitInfo
}

export interface ContributorInfo {
  name: string
  email: string
  commit_count: number
}

export interface AuthorInfo {
  name: string
  email: string
}

export interface CommitDetail {
  oid: string
  message: string
  author: AuthorInfo
  committer: AuthorInfo
  timestamp: number
  relative_time: string
  parent_count: number
  parents: string[]
}

export interface CommitListResponse {
  commits: CommitDetail[]
  total: number
  has_more: boolean
}

export interface DiffResponse {
  from_commit?: string
  to_commit: string
  path?: string
  files: FileDiff[]
  stats: DiffStats
}

export interface FileDiff {
  old_path?: string
  new_path?: string
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied' | 'typechanged' | 'unmodified'
  hunks: DiffHunk[]
  old_content?: string
  new_content?: string
  is_binary: boolean
}

export interface DiffHunk {
  old_start: number
  old_lines: number
  new_start: number
  new_lines: number
  header: string
  lines: DiffLine[]
}

export interface DiffLine {
  line_type: 'context' | 'addition' | 'deletion' | 'header'
  old_lineno?: number
  new_lineno?: number
  content: string
}

export interface DiffStats {
  files_changed: number
  insertions: number
  deletions: number
}
