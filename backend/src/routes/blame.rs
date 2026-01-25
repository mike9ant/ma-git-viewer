//! Blame endpoint.
//!
//! GET /api/v1/repository/blame?path=<path>&commit=<optional>
//!
//! Returns per-line author attribution for a file at a specific commit:
//! - Line number, author name/email, commit OID, timestamp
//!
//! Used by: DiffViewer to show who last modified each line

use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::error::Result;
use crate::git::SharedRepo;
use crate::models::BlameResponse;

pub fn routes(repo: SharedRepo) -> Router {
    Router::new()
        .route("/api/v1/repository/blame", get(get_blame))
        .with_state(repo)
}

#[derive(Debug, Deserialize)]
struct BlameQuery {
    path: String,
    commit: Option<String>,
}

async fn get_blame(
    State(repo): State<SharedRepo>,
    Query(query): Query<BlameQuery>,
) -> Result<Json<BlameResponse>> {
    let repo = repo.read().map_err(|_| crate::error::AppError::Internal("Lock poisoned".to_string()))?;
    let response = repo.get_blame(&query.path, query.commit.as_deref())?;
    Ok(Json(response))
}
