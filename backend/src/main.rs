//! Git Repository Viewer - Backend Server
//!
//! A REST API server that provides git repository data to the frontend.
//! Uses libgit2 for git operations and Axum for HTTP handling.
//!
//! # Usage
//! ```bash
//! cargo run -- /path/to/repository
//! ```
//!
//! # Endpoints
//! - `GET /api/v1/repository` - Repository metadata (name, branch, HEAD)
//! - `GET /api/v1/repository/tree` - Directory listing with last commit info
//! - `GET /api/v1/repository/file` - File content
//! - `GET /api/v1/repository/commits` - Commit history with filtering
//! - `GET /api/v1/repository/diff` - Diff between commits
//! - `GET /api/v1/repository/directory-info` - Directory statistics
//! - `GET /api/v1/filesystem/list` - Browse filesystem for repo switching
//! - `POST /api/v1/filesystem/switch` - Switch to different repository

mod error;
mod git;
mod models;
mod routes;

use std::sync::{Arc, RwLock};

use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use git::GitRepository;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Get repository path from args or use current directory
    let repo_path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| ".".to_string());

    tracing::info!("Opening repository at: {}", repo_path);

    // Open the git repository
    let repo = GitRepository::open(&repo_path)?;
    let shared_repo = Arc::new(RwLock::new(repo));

    // CORS configuration for development
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build the router
    let app = Router::new()
        .merge(routes::create_router(shared_repo))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    // Start the server
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001").await?;
    tracing::info!("Server listening on http://127.0.0.1:3001");

    axum::serve(listener, app).await?;

    Ok(())
}
