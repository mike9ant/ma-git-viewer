//! Diff-related DTOs.
//!
//! - `DiffResponse`: Complete diff with files, stats, and contributors
//! - `FileDiff`: Single file's changes with hunks and author info
//! - `DiffHunk`: Contiguous block of changes with context
//! - `DiffLine`: Single line (addition, deletion, or context)
//! - `FileAuthorInfo`: Who touched a file, with commit count (for author badges)
//!
//! Used by: DiffViewer to render side-by-side or unified diff view

use serde::{Deserialize, Serialize};
use super::AuthorInfo;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileAuthorInfo {
    pub email: String,
    pub name: String,
    pub commit_count: usize,
    pub last_commit_timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResponse {
    pub from_commit: Option<String>,
    pub to_commit: String,
    pub path: Option<String>,
    pub files: Vec<FileDiff>,
    pub stats: DiffStats,
    pub contributors: Vec<AuthorInfo>,
    pub total_files: usize,
    pub filtered_files: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub status: DiffStatus,
    pub hunks: Vec<DiffHunk>,
    pub old_content: Option<String>,
    pub new_content: Option<String>,
    pub is_binary: bool,
    pub authors: Vec<FileAuthorInfo>,
    pub biggest_change_author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiffStatus {
    Added,
    Deleted,
    Modified,
    Renamed,
    Copied,
    TypeChanged,
    Unmodified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub line_type: LineType,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LineType {
    Context,
    Addition,
    Deletion,
    Header,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiffStats {
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkingTreeStatus {
    pub has_changes: bool,
    pub files_changed: usize,
}
