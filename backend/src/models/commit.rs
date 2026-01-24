use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitDetail {
    pub oid: String,
    pub message: String,
    pub author: AuthorInfo,
    pub committer: AuthorInfo,
    pub timestamp: i64,
    pub relative_time: String,
    pub parent_count: usize,
    pub parents: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorInfo {
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitListResponse {
    pub commits: Vec<CommitDetail>,
    pub total: usize,
    pub filtered_total: usize,
    pub has_more: bool,
    pub contributors: Vec<AuthorInfo>,
}
