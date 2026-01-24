use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::error::{AppError, Result};
use crate::git::SharedRepo;
use crate::models::DiffResponse;

pub fn routes(repo: SharedRepo) -> Router {
    Router::new()
        .route("/api/v1/repository/diff", get(get_diff))
        .with_state(repo)
}

#[derive(Debug, Deserialize)]
struct DiffQuery {
    from: Option<String>,
    to: String,
    path: Option<String>,
}

async fn get_diff(
    State(repo): State<SharedRepo>,
    Query(query): Query<DiffQuery>,
) -> Result<Json<DiffResponse>> {
    let repo = repo.read().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
    let response = repo.get_diff(
        query.from.as_deref(),
        &query.to,
        query.path.as_deref(),
    )?;
    Ok(Json(response))
}
