use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::error::{AppError, Result};
use crate::git::SharedRepo;
use crate::models::CommitListResponse;

pub fn routes(repo: SharedRepo) -> Router {
    Router::new()
        .route("/api/v1/repository/commits", get(get_commits))
        .with_state(repo)
}

#[derive(Debug, Deserialize)]
struct CommitsQuery {
    path: Option<String>,
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default)]
    offset: usize,
    exclude_authors: Option<String>,
}

fn default_limit() -> usize {
    50
}

async fn get_commits(
    State(repo): State<SharedRepo>,
    Query(query): Query<CommitsQuery>,
) -> Result<Json<CommitListResponse>> {
    let repo = repo.read().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
    let exclude_authors: Option<Vec<String>> = query.exclude_authors
        .map(|s| s.split(',').map(|e| e.trim().to_string()).collect());
    let response = repo.get_commits(
        query.path.as_deref(),
        query.limit,
        query.offset,
        exclude_authors.as_deref(),
    )?;
    Ok(Json(response))
}
