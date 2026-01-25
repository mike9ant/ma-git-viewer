//! Thread-safe git repository wrapper.
//!
//! Provides `GitRepository` struct that wraps libgit2's Repository with:
//! - Mutex for thread-safe access (libgit2 Repository is not thread-safe)
//! - Commit cache for fast history queries (lazily initialized)
//! - Helper methods for common operations
//!
//! Used by: All route handlers via `SharedRepo` (Arc<RwLock<GitRepository>>)

use git2::Repository;
use std::path::Path;
use std::sync::{Arc, Mutex, RwLock};

use crate::error::{AppError, Result};
use crate::git::cache::CommitCache;
use crate::models::{CommitInfo, RepositoryInfo};

pub struct GitRepository {
    pub repo: Mutex<Repository>,
    pub path: String,
    /// Commit cache for fast history queries (lazily initialized)
    pub cache: Mutex<Option<CommitCache>>,
}

impl GitRepository {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path_str = path.as_ref().to_string_lossy().to_string();
        let repo = Repository::discover(&path).map_err(|_| AppError::RepoNotFound(path_str.clone()))?;

        Ok(Self {
            repo: Mutex::new(repo),
            path: path_str,
            cache: Mutex::new(None),
        })
    }

    /// Get or initialize the commit cache, rebuilding if HEAD has changed
    pub fn with_cache<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&mut CommitCache, &Repository) -> Result<T>,
    {
        let repo = self.repo.lock().map_err(|_| AppError::Internal("Repo lock poisoned".to_string()))?;
        let mut cache_guard = self.cache.lock().map_err(|_| AppError::Internal("Cache lock poisoned".to_string()))?;

        // Check if we need to (re)build the cache
        let needs_rebuild = match cache_guard.as_ref() {
            None => true,
            Some(cache) => !cache.is_valid(&repo),
        };

        if needs_rebuild {
            tracing::info!("Building commit cache...");
            let start = std::time::Instant::now();
            let new_cache = CommitCache::build(&repo)?;
            tracing::info!(
                "Cache built: {} commits in {:?}",
                new_cache.all_commits.len(),
                start.elapsed()
            );
            *cache_guard = Some(new_cache);
        }

        let cache = cache_guard.as_mut().unwrap();
        f(cache, &repo)
    }

    pub fn info(&self) -> Result<RepositoryInfo> {
        let repo = self.repo.lock().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;

        let name = Path::new(&self.path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        let head_branch = repo.head().ok().and_then(|h| {
            if h.is_branch() {
                h.shorthand().map(|s| s.to_string())
            } else {
                None
            }
        });

        let head_commit = repo.head().ok().and_then(|h| {
            h.peel_to_commit().ok().map(|c| commit_to_info(&c))
        });

        Ok(RepositoryInfo {
            name,
            path: self.path.clone(),
            head_branch,
            head_commit,
            is_bare: repo.is_bare(),
            is_empty: repo.is_empty().unwrap_or(true),
        })
    }

    pub fn with_repo<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Repository) -> Result<T>,
    {
        let repo = self.repo.lock().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
        f(&repo)
    }
}

pub fn commit_to_info(commit: &git2::Commit) -> CommitInfo {
    let timestamp = commit.time().seconds();
    CommitInfo {
        oid: commit.id().to_string(),
        message: commit.message().unwrap_or("").trim().to_string(),
        author: commit.author().name().unwrap_or("Unknown").to_string(),
        timestamp,
        relative_time: format_relative_time(timestamp),
    }
}

pub fn format_relative_time(timestamp: i64) -> String {
    let now = chrono::Utc::now().timestamp();
    let diff = now - timestamp;

    if diff < 60 {
        "just now".to_string()
    } else if diff < 3600 {
        let mins = diff / 60;
        format!("{} minute{} ago", mins, if mins == 1 { "" } else { "s" })
    } else if diff < 86400 {
        let hours = diff / 3600;
        format!("{} hour{} ago", hours, if hours == 1 { "" } else { "s" })
    } else if diff < 2592000 {
        let days = diff / 86400;
        format!("{} day{} ago", days, if days == 1 { "" } else { "s" })
    } else if diff < 31536000 {
        let months = diff / 2592000;
        format!("{} month{} ago", months, if months == 1 { "" } else { "s" })
    } else {
        let years = diff / 31536000;
        format!("{} year{} ago", years, if years == 1 { "" } else { "s" })
    }
}

pub type SharedRepo = Arc<RwLock<GitRepository>>;
