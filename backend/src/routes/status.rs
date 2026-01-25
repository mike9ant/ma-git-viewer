//! Directory status/info endpoint.
//!
//! GET /api/v1/repository/directory-info?path=
//!
//! Returns directory statistics:
//! - File and directory counts
//! - Total size
//! - Contributors (who committed to files in this directory)
//! - First and latest commit dates
//!
//! Used by: StatusTab in bottom panel (directory statistics view)

use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::error::{AppError, Result};
use crate::git::SharedRepo;
use crate::models::DirectoryInfo;

pub fn routes(repo: SharedRepo) -> Router {
    Router::new()
        .route("/api/v1/repository/directory-info", get(get_directory_info))
        .with_state(repo)
}

#[derive(Debug, Deserialize)]
struct DirectoryQuery {
    path: Option<String>,
}

async fn get_directory_info(
    State(repo): State<SharedRepo>,
    Query(query): Query<DirectoryQuery>,
) -> Result<Json<DirectoryInfo>> {
    let repo = repo.read().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
    let info = repo.get_directory_info(query.path.as_deref())?;
    Ok(Json(info))
}
