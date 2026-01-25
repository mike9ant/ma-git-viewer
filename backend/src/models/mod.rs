//! Data transfer objects (DTOs) for API responses.
//!
//! These structs are serialized to JSON for frontend consumption.
//! - `tree`: TreeEntry, RepositoryInfo, DirectoryInfo, CommitInfo
//! - `commit`: CommitDetail, CommitListResponse, AuthorInfo
//! - `diff`: DiffResponse, FileDiff, DiffHunk, DiffLine
//! - `filesystem`: DirectoryListing, FilesystemEntry for repo switching

pub mod commit;
pub mod diff;
pub mod filesystem;
pub mod tree;

pub use commit::*;
pub use diff::*;
pub use filesystem::*;
pub use tree::*;
