//! Filesystem browsing DTOs for repository switching.
//!
//! - `DirectoryListing`: Directory contents with parent path for navigation
//! - `FilesystemEntry`: Single directory entry, flagged if it's a git repo
//! - `SwitchRepoRequest`: Request body for switching repositories
//!
//! Used by: RepoSwitcher component to browse and select repositories

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct FilesystemEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub is_git_repo: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DirectoryListing {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<FilesystemEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SwitchRepoRequest {
    pub path: String,
}
