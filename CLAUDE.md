# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Git Repository Viewer - a full-stack web application for exploring Git repositories. React 19 + TypeScript frontend with a Rust/Axum backend using libgit2.

## Commands

### Backend (Rust/Axum - runs on port 3001)
```bash
cd backend
cargo run -- /path/to/git/repository   # Start server (defaults to current dir)
cargo build --release                   # Production build
cargo watch -x 'run -- /path/to/repo'  # Dev with auto-reload (install: cargo install cargo-watch)
```

### Frontend (React/Vite - runs on port 5173)
```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Start dev server with HMR
npm run build        # Production build
npm run lint         # Run ESLint
```

**Important**: Backend must be running before starting frontend (frontend proxies `/api` to backend).

## Architecture

### Frontend State Management
- **Zustand** (`store/selectionStore.ts`): UI state - current path, selected file, selected commits, diff modal
- **React Query** (`api/hooks.ts`): Server state with automatic caching - repository data, tree, commits, diffs

### Backend Structure
- **git/**: Git operations using libgit2 - `repository.rs` (thread-safe wrapper), `tree.rs`, `history.rs`, `diff.rs`
- **routes/**: API handlers - `/repository`, `/tree`, `/commits`, `/diff`
- **models/**: DTOs for API responses
- **error.rs**: `AppError` enum with HTTP status mapping (404 for PathNotFound/RepoNotFound, 500 for GitError)

### Key Patterns
- Thread-safe Git access via `Arc<Mutex<Repository>>`
- Path alias: `@/` maps to `frontend/src/`
- Vite dev proxy: `/api` → `http://127.0.0.1:3001`

## API Endpoints

| Endpoint | Query Params |
|----------|--------------|
| `GET /api/v1/repository` | - |
| `GET /api/v1/repository/tree` | `path`, `include_last_commit` |
| `GET /api/v1/repository/tree/full` | - |
| `GET /api/v1/repository/file` | `path` |
| `GET /api/v1/repository/commits` | `path`, `limit`, `offset` |
| `GET /api/v1/repository/diff` | `from`, `to`, `path` |
