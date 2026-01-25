//! Tree and repository-related DTOs.
//!
//! - `TreeEntry`: Single file/directory in a listing (FileList view)
//! - `FullTreeEntry`: Recursive tree node (FileTree sidebar)
//! - `RepositoryInfo`: Repo metadata (header display)
//! - `DirectoryInfo`: Directory statistics (StatusTab)
//! - `CommitInfo`: Basic commit info (last commit in tree entries)
//! - `ContributorInfo`: Author with commit count

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub entry_type: EntryType,
    pub size: Option<u64>,
    pub file_count: Option<u32>,
    pub directory_count: Option<u32>,
    pub last_commit: Option<CommitInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryType {
    File,
    Directory,
    Symlink,
    Submodule,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub oid: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
    pub relative_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullTreeEntry {
    pub name: String,
    pub path: String,
    pub entry_type: EntryType,
    pub children: Option<Vec<FullTreeEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryInfo {
    pub name: String,
    pub path: String,
    pub head_branch: Option<String>,
    pub head_commit: Option<CommitInfo>,
    pub is_bare: bool,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryInfo {
    pub path: String,
    pub file_count: usize,
    pub directory_count: usize,
    pub total_size: u64,
    pub contributors: Vec<ContributorInfo>,
    pub first_commit: Option<CommitInfo>,
    pub latest_commit: Option<CommitInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributorInfo {
    pub name: String,
    pub email: String,
    pub commit_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub last_commit: Option<CommitInfo>,
}
