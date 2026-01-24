use git2::Repository;
use std::path::Path;
use std::sync::{Arc, Mutex, RwLock};

use crate::error::{AppError, Result};
use crate::models::{CommitInfo, RepositoryInfo};

pub struct GitRepository {
    pub repo: Mutex<Repository>,
    pub path: String,
}

impl GitRepository {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path_str = path.as_ref().to_string_lossy().to_string();
        let repo = Repository::discover(&path).map_err(|_| AppError::RepoNotFound(path_str.clone()))?;

        Ok(Self {
            repo: Mutex::new(repo),
            path: path_str,
        })
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
