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
use crate::models::{BranchInfo, CommitInfo, RepositoryInfo};

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

    /// List all local branches in the repository
    pub fn list_branches(&self) -> Result<Vec<BranchInfo>> {
        let repo = self.repo.lock().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;

        let head = repo.head().ok();
        let current_branch = head.as_ref().and_then(|h| {
            if h.is_branch() {
                h.shorthand().map(|s| s.to_string())
            } else {
                None
            }
        });

        let mut branches = Vec::new();

        for branch_result in repo.branches(Some(git2::BranchType::Local))? {
            let (branch, _) = branch_result?;
            let name = branch.name()?.unwrap_or("").to_string();
            let is_current = current_branch.as_ref() == Some(&name);

            let last_commit = branch.get().peel_to_commit().ok().map(|c| commit_to_info(&c));

            branches.push(BranchInfo {
                name: name.clone(),
                is_current,
                last_commit,
            });
        }

        // Sort: current branch first, then alphabetically
        branches.sort_by(|a, b| {
            match (a.is_current, b.is_current) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        Ok(branches)
    }

    /// Checkout a branch by name
    pub fn checkout_branch(&self, branch_name: &str) -> Result<()> {
        let repo = self.repo.lock().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;

        // Find the branch
        let branch = repo.find_branch(branch_name, git2::BranchType::Local)
            .map_err(|_| AppError::PathNotFound(format!("Branch not found: {}", branch_name)))?;

        let refname = branch.get().name()
            .ok_or_else(|| AppError::Internal("Invalid branch reference".to_string()))?;

        // Check for uncommitted changes before attempting checkout
        let statuses = repo.statuses(Some(
            git2::StatusOptions::new()
                .include_untracked(false)
                .include_ignored(false)
        ))?;

        let dirty_files: Vec<String> = statuses
            .iter()
            .filter(|s| {
                let status = s.status();
                status.intersects(
                    git2::Status::INDEX_NEW
                        | git2::Status::INDEX_MODIFIED
                        | git2::Status::INDEX_DELETED
                        | git2::Status::INDEX_RENAMED
                        | git2::Status::INDEX_TYPECHANGE
                        | git2::Status::WT_MODIFIED
                        | git2::Status::WT_DELETED
                        | git2::Status::WT_RENAMED
                        | git2::Status::WT_TYPECHANGE
                )
            })
            .filter_map(|s| s.path().map(|p| p.to_string()))
            .take(5) // Limit to first 5 files
            .collect();

        if !dirty_files.is_empty() {
            let file_list = dirty_files.join(", ");
            let more = if statuses.len() > 5 {
                format!(" and {} more", statuses.len() - 5)
            } else {
                String::new()
            };
            return Err(AppError::CheckoutConflict(format!(
                "Cannot switch branches: you have uncommitted changes in: {}{}",
                file_list, more
            )));
        }

        // Set HEAD to the branch
        repo.set_head(refname)?;

        // Checkout the tree to update working directory
        let commit = branch.get().peel_to_commit()?;
        let tree = commit.tree()?;

        let mut checkout_builder = git2::build::CheckoutBuilder::new();
        checkout_builder.safe(); // Don't overwrite uncommitted changes

        repo.checkout_tree(tree.as_object(), Some(&mut checkout_builder))?;

        tracing::info!("Checked out branch: {}", branch_name);

        Ok(())
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
