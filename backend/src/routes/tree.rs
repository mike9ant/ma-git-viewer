use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::error::Result;
use crate::git::SharedRepo;
use crate::models::{FullTreeEntry, TreeEntry};

pub fn routes(repo: SharedRepo) -> Router {
    Router::new()
        .route("/api/v1/repository/tree", get(get_tree))
        .route("/api/v1/repository/tree/full", get(get_full_tree))
        .route("/api/v1/repository/file", get(get_file_content))
        .with_state(repo)
}

#[derive(Debug, Deserialize)]
struct TreeQuery {
    path: Option<String>,
    #[serde(default = "default_true")]
    include_last_commit: bool,
}

fn default_true() -> bool {
    true
}

async fn get_tree(
    State(repo): State<SharedRepo>,
    Query(query): Query<TreeQuery>,
) -> Result<Json<Vec<TreeEntry>>> {
    let entries = repo.get_tree_entries(
        query.path.as_deref(),
        query.include_last_commit,
    )?;
    Ok(Json(entries))
}

async fn get_full_tree(State(repo): State<SharedRepo>) -> Result<Json<Vec<FullTreeEntry>>> {
    let tree = repo.get_full_tree()?;
    Ok(Json(tree))
}

#[derive(Debug, Deserialize)]
struct FileQuery {
    path: String,
}

async fn get_file_content(
    State(repo): State<SharedRepo>,
    Query(query): Query<FileQuery>,
) -> Result<Json<String>> {
    let content = repo.get_file_content(&query.path)?;
    Ok(Json(content))
}
