# Original Requirements

This document reconstructs the original prompts and requirements that were used to create the Git Repository Viewer application. These are inferred from the implemented features and architecture.

## Initial Prompt (Inferred)

> Create a Git repository viewer application that allows users to visually explore Git repositories through a web interface. The application should have a React frontend and a Rust backend using libgit2.

## Core Requirements

### 1. Repository Browsing

> The user should be able to:
> - Browse the file and folder structure of a Git repository
> - See a tree view of all directories in a sidebar
> - View contents of directories in a main panel with file details
> - Navigate through directories by clicking on folders

**Implemented as:**
- `FileTree` component: Recursive sidebar showing full directory structure
- `FileList` component: Table view with Name, Last Commit, Date, and Size columns
- Breadcrumb navigation in file list header
- Click-to-navigate in both tree and list views

### 2. File Metadata Display

> For each file/directory, show:
> - File name and type (file vs directory)
> - The last commit that modified this file
> - When that commit was made (relative time like "5 minutes ago")
> - File size for files

**Implemented as:**
- `TreeEntry` model with `name`, `path`, `entry_type`, `size`, `last_commit`
- Backend calculates last commit by walking history
- Relative time formatting in backend (`format_relative_time`)
- Size displayed in human-readable format

### 3. Commit History

> Users should be able to:
> - View the commit history of the repository
> - Filter commits to only those affecting the current directory/file
> - See commit message, author, and timestamp for each commit
> - Navigate through history with pagination

**Implemented as:**
- `HistoryTab` component in bottom panel
- Path filtering via `/commits?path=` endpoint
- Pagination with limit/offset parameters
- Commit details: OID, message, author name, author email, relative time

### 4. Commit Comparison (Diff)

> Users should be able to:
> - Select two commits and compare them
> - See which files changed between commits
> - View the actual diff with added/removed lines highlighted
> - See statistics about the changes (files changed, insertions, deletions)

**Implemented as:**
- Multi-select commits in history tab (max 2)
- "Compare" button when 2 commits selected
- "vs HEAD" quick comparison button
- `DiffViewer` with unified diff format
- File change status indicators (added, deleted, modified, renamed)
- Diff statistics in header

### 5. UI/UX Requirements

> The interface should:
> - Have a clean, modern design
> - Use a resizable panel layout (tree, content, history)
> - Show repository info in a header (name, branch, current commit)
> - Be responsive and fast

**Implemented as:**
- Tailwind CSS for styling
- `react-resizable-panels` for flexible layout
- Header with repository name, current branch, HEAD commit info
- Dark/neutral color scheme
- Loading states and error handling

## Technical Requirements

### Frontend Stack

> Use modern React with:
> - TypeScript for type safety
> - Vite for fast development
> - React Query for server state
> - A lightweight state manager for UI state

**Implemented with:**
- React 19 + TypeScript
- Vite 5 with HMR
- TanStack React Query 5
- Zustand for client state
- Radix UI for accessible components

### Backend Stack

> Use Rust with:
> - Axum web framework
> - libgit2 for Git operations
> - Proper error handling
> - JSON API responses

**Implemented with:**
- Rust + Axum 0.8
- git2 crate (libgit2 bindings)
- Custom `AppError` enum with HTTP mapping
- Serde for JSON serialization
- Tower-http for CORS

## API Design Requirements

> Create a RESTful API with endpoints for:
> - Getting repository information
> - Listing directory contents (tree)
> - Getting full tree structure
> - Getting file contents
> - Listing commits with filtering
> - Getting diff between commits

**Implemented endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/repository` | GET | Repository metadata |
| `/api/v1/repository/tree` | GET | Directory contents |
| `/api/v1/repository/tree/full` | GET | Full recursive tree |
| `/api/v1/repository/file` | GET | File content |
| `/api/v1/repository/commits` | GET | Commit history |
| `/api/v1/repository/diff` | GET | Compare commits |

## Follow-up Prompt (Inferred)

> Fix Node.js compatibility and improve the resizable panel layout to work better on different screen sizes.

**Addressed in commit 93c5346:**
- Fixed Node.js compatibility issues
- Improved resizable panel layout and behavior

## Non-Functional Requirements (Inferred)

1. **Performance**: Fast loading and navigation through large repositories
2. **Reliability**: Graceful error handling for missing paths, invalid commits
3. **Usability**: Intuitive navigation similar to GitHub/GitLab web interfaces
4. **Maintainability**: Clean separation between frontend and backend
5. **Extensibility**: Modular architecture for adding features

## Features Not Requested (Future Scope)

Based on what was NOT implemented, these were likely not part of the original requirements:

- File content viewing/editing
- Branch switching
- Creating commits
- Remote repository support
- Authentication/authorization
- Search functionality
- Blame view
- Tag management
- Merge/rebase operations
