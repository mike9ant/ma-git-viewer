//! Blame data transfer objects.
//!
//! Provides per-line author attribution for file content at a specific commit.
//! Used by the diff viewer to show who last modified each line.

use serde::Serialize;

/// Response for blame request on a file at a specific commit.
#[derive(Debug, Serialize)]
pub struct BlameResponse {
    /// Path of the file
    pub path: String,
    /// Commit OID where blame was calculated
    pub commit: String,
    /// Per-line blame information
    pub lines: Vec<BlameLine>,
}

/// Blame information for a single line.
#[derive(Debug, Serialize)]
pub struct BlameLine {
    /// Line number (1-indexed)
    pub line_number: u32,
    /// Name of the author who last modified this line
    pub author_name: String,
    /// Email of the author who last modified this line
    pub author_email: String,
    /// OID of the commit that last modified this line
    pub commit_oid: String,
    /// Unix timestamp of when this line was last modified
    pub timestamp: i64,
}
