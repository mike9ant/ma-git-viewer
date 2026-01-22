pub mod commits;
pub mod diff;
pub mod repository;
pub mod status;
pub mod tree;

use axum::Router;

use crate::git::SharedRepo;

pub fn create_router(repo: SharedRepo) -> Router {
    Router::new()
        .merge(repository::routes(repo.clone()))
        .merge(tree::routes(repo.clone()))
        .merge(commits::routes(repo.clone()))
        .merge(diff::routes(repo.clone()))
        .merge(status::routes(repo))
}
