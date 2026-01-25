//! Branch listing and switching endpoints.
//!
//! - GET /api/v1/repository/branches
//!   Lists all local and remote branches with current branch flagged.
//!   Used by: BranchSwitcher dropdown in header
//!
//! - POST /api/v1/repository/checkout { branch: string }
//!   Switches to a local branch.
//!   Updates HEAD and working directory. Cache auto-invalidates on next query.
//!
//! - POST /api/v1/repository/checkout-remote { remote_branch: string, local_name: string }
//!   Creates a local tracking branch from a remote and checks it out.

use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;

use crate::error::{AppError, Result};
use crate::git::SharedRepo;
use crate::models::BranchInfo;

pub fn routes(repo: SharedRepo) -> Router {
    Router::new()
        .route("/api/v1/repository/branches", get(list_branches))
        .route("/api/v1/repository/checkout", post(checkout_branch))
        .route("/api/v1/repository/checkout-remote", post(checkout_remote_branch))
        .with_state(repo)
}

async fn list_branches(State(repo): State<SharedRepo>) -> Result<Json<Vec<BranchInfo>>> {
    let repo = repo.read().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
    let branches = repo.list_branches()?;
    Ok(Json(branches))
}

#[derive(Debug, Deserialize)]
struct CheckoutRequest {
    branch: String,
}

async fn checkout_branch(
    State(repo): State<SharedRepo>,
    Json(request): Json<CheckoutRequest>,
) -> Result<Json<()>> {
    let repo = repo.read().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
    repo.checkout_branch(&request.branch)?;
    Ok(Json(()))
}

#[derive(Debug, Deserialize)]
struct CheckoutRemoteRequest {
    remote_branch: String,
    local_name: String,
}

async fn checkout_remote_branch(
    State(repo): State<SharedRepo>,
    Json(request): Json<CheckoutRemoteRequest>,
) -> Result<Json<()>> {
    let repo = repo.read().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
    repo.checkout_remote_branch(&request.remote_branch, &request.local_name)?;
    Ok(Json(()))
}
