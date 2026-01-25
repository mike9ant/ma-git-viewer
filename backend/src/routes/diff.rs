//! Diff endpoint.
//!
//! GET /api/v1/repository/diff?from=&to=&path=&exclude_authors=
//!
//! Returns diff between two commits (or commit and its parent if `from` omitted):
//! - File list with status (added/modified/deleted/renamed)
//! - Hunks with line-by-line changes
//! - Full file contents for side-by-side diff view
//! - Author attribution per file (who touched each file)
//! - Author filtering to hide files by excluded contributors
//!
//! Used by: DiffViewer modal (single commit view or compare two commits)

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
    exclude_authors: Option<String>,
}

async fn get_diff(
    State(repo): State<SharedRepo>,
    Query(query): Query<DiffQuery>,
) -> Result<Json<DiffResponse>> {
    let repo = repo.read().map_err(|_| AppError::Internal("Lock poisoned".to_string()))?;
    let mut response = repo.get_diff(
        query.from.as_deref(),
        &query.to,
        query.path.as_deref(),
    )?;

    // Apply author filtering if requested
    if let Some(ref exclude_str) = query.exclude_authors {
        let excluded_emails: std::collections::HashSet<&str> = exclude_str
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        if !excluded_emails.is_empty() {
            // Filter out files where ALL authors are excluded
            response.files.retain(|file| {
                // Keep files with no authors (shouldn't happen) or with at least one non-excluded author
                file.authors.is_empty() || file.authors.iter().any(|a| !excluded_emails.contains(a.email.as_str()))
            });
            response.filtered_files = response.files.len();
        }
    }

    Ok(Json(response))
}
