//! Filesystem browsing and repository switching.
//!
//! - GET /api/v1/filesystem/list?path=
//!   Lists directories (not files) at path, marking which are git repos.
//!   Used by: RepoSwitcher to browse for other repositories
//!
//! - POST /api/v1/filesystem/switch { path: string }
//!   Switches the backend to serve a different git repository.
//!   Replaces the shared GitRepository instance.
//!   Used by: RepoSwitcher when user selects a new repo

use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use std::path::Path;

use crate::error::{AppError, Result};
use crate::git::{GitRepository, SharedRepo};
use crate::models::{DirectoryListing, FilesystemEntry, RepositoryInfo, SwitchRepoRequest};

pub fn routes(repo: SharedRepo) -> Router {
    Router::new()
        .route("/api/v1/filesystem/list", get(list_directory))
        .route("/api/v1/filesystem/switch", post(switch_repository))
        .with_state(repo)
}

#[derive(Debug, Deserialize)]
struct ListParams {
    path: Option<String>,
}

async fn list_directory(
    State(repo): State<SharedRepo>,
    Query(params): Query<ListParams>,
) -> Result<Json<DirectoryListing>> {
    // If no path provided, use parent of current repo
    let target_path = match params.path {
        Some(p) => p,
        None => {
            let repo_guard = repo.read().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
            let current_repo_path = &repo_guard.path;
            Path::new(current_repo_path)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "/".to_string())
        }
    };

    let path = Path::new(&target_path);
    if !path.is_dir() {
        return Err(AppError::PathNotFound(target_path));
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(path).map_err(|e| AppError::Internal(e.to_string()))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| AppError::Internal(e.to_string()))?;
        let entry_path = entry.path();
        let is_directory = entry_path.is_dir();
        let is_git_repo = is_directory && entry_path.join(".git").exists();

        // Skip hidden files/directories
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        // Only include directories
        if !is_directory {
            continue;
        }

        entries.push(FilesystemEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory,
            is_git_repo,
        });
    }

    // Sort alphabetically
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let parent_path = path.parent().map(|p| p.to_string_lossy().to_string());

    Ok(Json(DirectoryListing {
        current_path: target_path,
        parent_path,
        entries,
    }))
}

async fn switch_repository(
    State(repo): State<SharedRepo>,
    Json(request): Json<SwitchRepoRequest>,
) -> Result<Json<RepositoryInfo>> {
    let new_repo = GitRepository::open(&request.path)?;
    let info = new_repo.info()?;

    let mut repo_guard = repo.write().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
    *repo_guard = new_repo;

    Ok(Json(info))
}
