//! Repository info endpoint.
//!
//! GET /api/v1/repository - Returns basic repository metadata:
//! name, path, current branch, HEAD commit, bare/empty status.
//!
//! Used by: AppLayout header to display repo name and branch

use axum::{extract::State, routing::get, Json, Router};

use crate::error::{AppError, Result};
use crate::git::SharedRepo;
use crate::models::RepositoryInfo;

pub fn routes(repo: SharedRepo) -> Router {
    Router::new()
        .route("/api/v1/repository", get(get_repository_info))
        .with_state(repo)
}

async fn get_repository_info(State(repo): State<SharedRepo>) -> Result<Json<RepositoryInfo>> {
    let repo = repo.read().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
    let info = repo.info()?;
    Ok(Json(info))
}
