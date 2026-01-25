//! Application error types and HTTP response mapping.
//!
//! Defines `AppError` enum for all error conditions and implements Axum's
//! `IntoResponse` to automatically convert errors to appropriate HTTP responses
//! with JSON error bodies.
//!
//! Error mappings:
//! - `RepoNotFound`, `PathNotFound`, `CommitNotFound` → 404
//! - `InvalidPath` → 400
//! - `Git`, `Internal` → 500

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),

    #[error("Repository not found: {0}")]
    RepoNotFound(String),

    #[error("Path not found: {0}")]
    PathNotFound(String),

    #[error("Commit not found: {0}")]
    CommitNotFound(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match &self {
            AppError::Git(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            AppError::RepoNotFound(path) => {
                (StatusCode::NOT_FOUND, format!("Repository not found: {}", path))
            }
            AppError::PathNotFound(path) => {
                (StatusCode::NOT_FOUND, format!("Path not found: {}", path))
            }
            AppError::CommitNotFound(oid) => {
                (StatusCode::NOT_FOUND, format!("Commit not found: {}", oid))
            }
            AppError::InvalidPath(path) => {
                (StatusCode::BAD_REQUEST, format!("Invalid path: {}", path))
            }
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
        };

        let body = Json(json!({
            "error": error_message,
        }));

        (status, body).into_response()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
