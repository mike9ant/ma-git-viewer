# Git Repository Viewer

A full-stack web application for visually exploring Git repositories. Browse repository structure, view file contents, examine commit history, and compare different versions of files through an intuitive UI.

## Features

- **File Tree Navigation**: Expandable directory tree showing complete repository structure
- **File Browser**: Table view of directory contents with last commit info, dates, and file sizes
- **Commit History**: View commits affecting specific paths with pagination support
- **Diff Comparison**: Compare any two commits with unified diff view, syntax highlighting, and statistics
- **Resizable Panels**: Flexible 3-panel layout that adapts to your workflow
- **Real-time Info**: Repository metadata, current branch, and HEAD commit displayed in header

## Technology Stack

### Frontend
- **React 19** with TypeScript
- **Vite 5** for fast development and builds
- **Tailwind CSS 4** for styling
- **TanStack React Query 5** for server state management
- **Zustand** for client state management
- **Radix UI** components (tabs, dialogs, scroll areas, tooltips)
- **react-diff-viewer-continued** for diff visualization

### Backend
- **Rust** with **Axum 0.8** web framework
- **Tokio** async runtime
- **git2** (libgit2 bindings) for Git operations
- **Tower-http** for CORS and request tracing

## Project Structure

```
ma-git-viewer/
├── frontend/                 # React/TypeScript web UI
│   ├── src/
│   │   ├── api/             # API client and React Query hooks
│   │   ├── components/      # React components
│   │   │   ├── layout/      # AppLayout with resizable panels
│   │   │   ├── file-tree/   # Directory tree sidebar
│   │   │   ├── file-list/   # File browser table
│   │   │   ├── bottom-panel/# History and status tabs
│   │   │   └── diff/        # Diff viewer and modal
│   │   ├── store/           # Zustand state management
│   │   └── lib/             # Utility functions
│   └── package.json
│
└── backend/                 # Rust/Axum API server
    ├── src/
    │   ├── git/             # Git operations (tree, history, diff)
    │   ├── routes/          # API endpoint handlers
    │   ├── models/          # Data structures
    │   └── error.rs         # Error handling
    └── Cargo.toml
```

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Rust** 1.70+ and Cargo
- **Git** (the repositories you want to view)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ma-git-viewer
   ```

2. **Start the backend server**
   ```bash
   cd backend
   cargo run -- /path/to/git/repository
   ```
   The server will start on `http://127.0.0.1:3001`

   If no path is provided, it uses the current directory.

3. **Start the frontend development server**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The frontend will be available at `http://localhost:5173`

### Production Build

**Frontend:**
```bash
cd frontend
npm run build
```

**Backend:**
```bash
cd backend
cargo build --release
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/repository` | Repository metadata (name, branch, HEAD) |
| `GET /api/v1/repository/tree?path=` | Directory contents at path |
| `GET /api/v1/repository/tree/full` | Full recursive tree structure |
| `GET /api/v1/repository/file?path=` | File content retrieval |
| `GET /api/v1/repository/commits?path=&limit=&offset=` | Commit history with filtering |
| `GET /api/v1/repository/diff?from=&to=&path=` | Compare two commits |

## Usage

1. **Navigate**: Click folders in the left tree or file list to browse directories
2. **View History**: The bottom panel shows commits affecting the current path
3. **Compare Commits**: Select up to 2 commits in the history tab, then click "Compare"
4. **Quick Diff**: Use "vs HEAD" button to compare any commit against the current HEAD

## Development

**Frontend hot reload**: Changes to frontend code automatically reload in the browser.

**Backend**: Restart the server after code changes, or use `cargo watch` for auto-reload:
```bash
cargo install cargo-watch
cargo watch -x 'run -- /path/to/repo'
```

## License

[Add your license here]

---

*Built with React, Rust, and libgit2*
