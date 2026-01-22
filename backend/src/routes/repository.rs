use axum::{extract::State, routing::get, Json, Router};

use crate::error::Result;
use crate::git::SharedRepo;
use crate::models::RepositoryInfo;

pub fn routes(repo: SharedRepo) -> Router {
    Router::new()
        .route("/api/v1/repository", get(get_repository_info))
        .with_state(repo)
}

async fn get_repository_info(State(repo): State<SharedRepo>) -> Result<Json<RepositoryInfo>> {
    let info = repo.info()?;
    Ok(Json(info))
}
