use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::error::Result;
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
}

fn default_limit() -> usize {
    50
}

async fn get_commits(
    State(repo): State<SharedRepo>,
    Query(query): Query<CommitsQuery>,
) -> Result<Json<CommitListResponse>> {
    let response = repo.get_commits(query.path.as_deref(), query.limit, query.offset)?;
    Ok(Json(response))
}
