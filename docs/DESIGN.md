# Design Document

This document describes the architecture, design decisions, and implementation details of the Git Repository Viewer application.

## Overview

The Git Repository Viewer is a full-stack application that provides a web-based interface for exploring Git repositories. It combines a React frontend with a Rust backend to deliver fast, responsive Git operations.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Zustand  │  │ React Query  │  │      UI Components       │  │
│  │  Store   │◄─┤    Cache     │◄─┤ (FileTree, FileList,    │  │
│  │          │  │              │  │  DiffViewer, etc.)       │  │
│  └──────────┘  └──────────────┘  └──────────────────────────┘  │
│                        │                                        │
│                        ▼                                        │
│                  ┌──────────┐                                   │
│                  │API Client│                                   │
│                  └──────────┘                                   │
└────────────────────────┼────────────────────────────────────────┘
                         │ HTTP (JSON)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (Rust/Axum)                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │    Routes    │──│    Models    │──│   Git Operations     │  │
│  │ (handlers)   │  │ (DTOs)       │  │   (git2 wrapper)     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                              │                  │
│                                              ▼                  │
│                                       ┌──────────────┐         │
│                                       │  libgit2     │         │
│                                       └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │  Git Repository  │
                                    │   (filesystem)   │
                                    └──────────────────┘
```

## Frontend Architecture

### Component Hierarchy

```
App
└── QueryClientProvider
    └── AppLayout
        ├── Header (repo name, branch, HEAD commit)
        ├── ResizablePanelGroup (horizontal)
        │   ├── FileTree (left sidebar)
        │   └── ResizablePanelGroup (vertical)
        │       ├── FileList (main content)
        │       └── BottomPanel
        │           ├── HistoryTab
        │           └── StatusTab
        └── DiffModal (overlay)
```

### State Management

**Zustand Store** (`selectionStore.ts`):
- `currentPath`: Currently selected directory path
- `selectedFile`: Currently selected file for viewing
- `selectedCommits`: Array of up to 2 commits for comparison
- `diffModalOpen`: Boolean controlling diff modal visibility
- `diffCommitFrom/To`: Commit OIDs being compared

**React Query**:
- Handles all server state (repository info, tree data, commits, diffs)
- Automatic caching and background refetching
- Query keys based on path and commit parameters

### Key Components

| Component | Purpose |
|-----------|---------|
| `AppLayout` | Main container with resizable 3-panel layout |
| `FileTree` | Recursive directory tree with expand/collapse |
| `FileList` | Table showing files with metadata (name, commit, date, size) |
| `HistoryTab` | Commit list with selection for comparison |
| `DiffViewer` | Detailed diff display with file status and hunks |
| `DiffModal` | Modal wrapper for DiffViewer |

## Backend Architecture

### Module Structure

```
backend/src/
├── main.rs           # Server entry point, router setup
├── error.rs          # AppError enum and HTTP mapping
├── git/
│   ├── mod.rs        # Module exports
│   ├── repository.rs # GitRepository wrapper
│   ├── tree.rs       # Tree/file operations
│   ├── history.rs    # Commit history operations
│   └── diff.rs       # Diff generation
├── routes/
│   ├── mod.rs        # Route registration
│   ├── repository.rs # /repository endpoint
│   ├── tree.rs       # /tree endpoints
│   ├── commits.rs    # /commits endpoint
│   └── diff.rs       # /diff endpoint
└── models/
    ├── mod.rs        # Model exports
    ├── commit.rs     # CommitInfo, CommitDetail
    ├── tree.rs       # TreeEntry, FullTreeEntry
    ├── diff.rs       # DiffResponse, FileChange, Hunk
    └── repository.rs # RepositoryInfo, DirectoryInfo
```

### Git Operations

**Repository Wrapper**:
- Thread-safe access via `Arc<Mutex<Repository>>`
- Automatic discovery from path or current directory
- Support for both bare and worktree repositories

**Key Operations**:
1. **Tree traversal**: List directory contents, get file info
2. **History retrieval**: Walk commit graph with path filtering
3. **Diff generation**: Compare trees between commits, generate hunks
4. **Last commit detection**: Find most recent commit affecting each path

### Error Handling

Custom `AppError` enum with variants:
- `GitError`: libgit2 errors
- `RepoNotFound`: Repository not found at path
- `PathNotFound`: Requested path doesn't exist
- `ParseError`: Failed to parse commit/tree IDs
- `InternalError`: Unexpected server errors

Each variant maps to appropriate HTTP status codes (404, 500, etc.).

## Data Flow

### Browsing Files

```
User clicks folder in FileTree
         │
         ▼
Zustand: setCurrentPath(newPath)
         │
         ▼
React Query: useTreeQuery(currentPath)
         │
         ▼
API: GET /api/v1/repository/tree?path={path}
         │
         ▼
Backend: get_tree_entries() + get_last_commit_for_path()
         │
         ▼
Response: TreeEntry[] with last commit info
         │
         ▼
FileList renders updated content
```

### Comparing Commits

```
User selects 2 commits in HistoryTab
         │
         ▼
Zustand: setSelectedCommits([commit1, commit2])
         │
         ▼
User clicks "Compare"
         │
         ▼
Zustand: setDiffCommits(from, to) + openDiffModal()
         │
         ▼
React Query: useDiffQuery(from, to)
         │
         ▼
API: GET /api/v1/repository/diff?from={oid}&to={oid}
         │
         ▼
Backend: compare_commits() → DiffResponse
         │
         ▼
DiffModal renders with file changes and hunks
```

## API Design

### Response Format

All responses use JSON with consistent structure:

**Success**: Direct data object
```json
{
  "name": "repo-name",
  "path": "/path/to/repo",
  "head_branch": "main"
}
```

**Error**:
```json
{
  "error": "Path not found: invalid/path"
}
```

### Pagination

Commit endpoints support pagination:
- `limit`: Number of results (default 50)
- `offset`: Starting position
- Response includes `total_count` and `has_more`

### Path Filtering

Tree and commit endpoints accept `path` parameter to scope results to specific directories or files.

## Design Decisions

### Why Rust for Backend?

1. **Performance**: Native libgit2 bindings for fast Git operations
2. **Type Safety**: Catch errors at compile time
3. **Memory Safety**: No runtime GC pauses
4. **Async Runtime**: Tokio provides excellent concurrency

### Why React Query over Redux?

1. **Server State Specialization**: Built for caching external data
2. **Automatic Caching**: Smart invalidation and background refetching
3. **Simpler Code**: Less boilerplate than Redux + thunks
4. **Dev Tools**: Excellent debugging support

### Why Zustand for Client State?

1. **Minimal Boilerplate**: Simple API, no providers needed
2. **TypeScript First**: Excellent type inference
3. **Selective Subscriptions**: Components only re-render on used state changes
4. **Small Bundle**: Tiny footprint (~1KB)

### Why Resizable Panels?

1. **User Preference**: Developers prefer customizable layouts
2. **Information Density**: Adjust panels based on current task
3. **Screen Utilization**: Better use of various screen sizes

## Performance Considerations

### Frontend

- **Query Deduplication**: React Query prevents duplicate requests
- **Optimistic Updates**: UI responds immediately when possible
- **Lazy Loading**: Tree expands on-demand, not all at once
- **Memoization**: Components memoized to prevent unnecessary re-renders

### Backend

- **Streaming**: Large diffs could use streaming responses (future improvement)
- **Caching**: libgit2 has internal object caching
- **Pagination**: Large histories paginated to limit memory use
- **Path Filtering**: Git pathspec filtering at the libgit2 level

## Future Improvements

1. **File Content Viewer**: Display file contents with syntax highlighting
2. **Blame View**: Line-by-line commit attribution
3. **Branch Switching**: View different branches
4. **Search**: Full-text search across repository
5. **Multiple Repositories**: Support viewing multiple repos
6. **Authentication**: Support for remote repositories
7. **WebSocket Updates**: Real-time updates when repository changes
