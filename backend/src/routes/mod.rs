//! API route handlers - maps HTTP endpoints to git operations.
//!
//! Each submodule defines routes for a feature area:
//! - `repository`: Basic repo info (GET /api/v1/repository)
//! - `branches`: Branch listing and switching
//! - `tree`: Directory listing and file content
//! - `commits`: Commit history with filtering
//! - `diff`: Diff between commits
//! - `blame`: Per-line author attribution
//! - `status`: Directory statistics
//! - `filesystem`: Browse filesystem and switch repositories

pub mod blame;
pub mod branches;
pub mod commits;
pub mod diff;
pub mod filesystem;
pub mod repository;
pub mod status;
pub mod tree;

use axum::Router;

use crate::git::SharedRepo;

pub fn create_router(repo: SharedRepo) -> Router {
    Router::new()
        .merge(repository::routes(repo.clone()))
        .merge(branches::routes(repo.clone()))
        .merge(tree::routes(repo.clone()))
        .merge(commits::routes(repo.clone()))
        .merge(diff::routes(repo.clone()))
        .merge(blame::routes(repo.clone()))
        .merge(status::routes(repo.clone()))
        .merge(filesystem::routes(repo))
}
