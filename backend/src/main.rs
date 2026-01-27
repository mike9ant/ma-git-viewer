//! Git Repository Viewer - A self-contained git repository browser
//!
//! # Usage
//! ```bash
//! git-viewer /path/to/repository        # Start server
//! git-viewer /path/to/repository --open # Start and open browser
//! git-viewer status                     # Check if running
//! git-viewer kill                       # Stop running instance
//! ```

mod error;
mod git;
mod models;
mod routes;

use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use axum::Router;
use axum::body::Body;
use axum::http::{header, Request, Response, StatusCode};
use axum::routing::get;
use clap::{Parser, Subcommand};
use rust_embed::Embed;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use git::GitRepository;

/// Embedded frontend static files
#[derive(Embed)]
#[folder = "../frontend/dist"]
struct Assets;

/// Git Repository Viewer - Browse git repositories in your browser
#[derive(Parser)]
#[command(name = "git-viewer")]
#[command(about = "A self-contained git repository browser", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Path to the git repository to view
    #[arg(value_name = "REPO_PATH")]
    repo_path: Option<String>,

    /// Open browser automatically after starting
    #[arg(short, long)]
    open: bool,

    /// Port to run the server on
    #[arg(short, long, default_value = "3001")]
    port: u16,
}

#[derive(Subcommand)]
enum Commands {
    /// Check if git-viewer is currently running
    Status,
    /// Stop the running git-viewer instance
    Kill,
}

/// PID file info stored as JSON
#[derive(serde::Serialize, serde::Deserialize)]
struct PidInfo {
    pid: u32,
    repo_path: String,
    port: u16,
}

fn get_pid_file_path() -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push("git-viewer.pid");
    path
}

fn read_pid_info() -> Option<PidInfo> {
    let path = get_pid_file_path();
    let mut file = fs::File::open(&path).ok()?;
    let mut contents = String::new();
    file.read_to_string(&mut contents).ok()?;
    serde_json::from_str(&contents).ok()
}

fn write_pid_info(info: &PidInfo) -> anyhow::Result<()> {
    let path = get_pid_file_path();
    let mut file = fs::File::create(&path)?;
    file.write_all(serde_json::to_string(info)?.as_bytes())?;
    Ok(())
}

fn remove_pid_file() {
    let _ = fs::remove_file(get_pid_file_path());
}

#[cfg(unix)]
fn is_process_running(pid: u32) -> bool {
    // On Unix, sending signal 0 checks if process exists
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

#[cfg(windows)]
fn is_process_running(pid: u32) -> bool {
    use std::process::Command;
    // On Windows, check if process exists using tasklist
    Command::new("tasklist")
        .args(&["/FI", &format!("PID eq {}", pid), "/NH"])
        .output()
        .map(|output| {
            let output_str = String::from_utf8_lossy(&output.stdout);
            output_str.contains(&pid.to_string())
        })
        .unwrap_or(false)
}

#[cfg(unix)]
fn kill_process(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, libc::SIGTERM) == 0 }
}

#[cfg(windows)]
fn kill_process(pid: u32) -> bool {
    use std::process::Command;
    // On Windows, use taskkill
    Command::new("taskkill")
        .args(&["/PID", &pid.to_string(), "/F"])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn handle_status() {
    match read_pid_info() {
        Some(info) => {
            if is_process_running(info.pid) {
                println!("✓ git-viewer is running");
                println!("  PID:  {}", info.pid);
                println!("  Repo: {}", info.repo_path);
                println!("  URL:  http://127.0.0.1:{}", info.port);
            } else {
                println!("✗ git-viewer is not running (stale PID file)");
                remove_pid_file();
            }
        }
        None => {
            println!("✗ git-viewer is not running");
        }
    }
}

fn handle_kill() {
    match read_pid_info() {
        Some(info) => {
            if is_process_running(info.pid) {
                if kill_process(info.pid) {
                    println!("✓ Stopped git-viewer (PID {})", info.pid);
                    remove_pid_file();
                } else {
                    println!("✗ Failed to stop git-viewer (PID {})", info.pid);
                }
            } else {
                println!("✗ git-viewer is not running (stale PID file)");
                remove_pid_file();
            }
        }
        None => {
            println!("✗ git-viewer is not running");
        }
    }
}

/// Serve embedded static files
async fn serve_static(req: Request<Body>) -> Response<Body> {
    let path = req.uri().path().trim_start_matches('/');

    // Default to index.html for root or non-file paths (SPA routing)
    let path = if path.is_empty() || !path.contains('.') {
        "index.html"
    } else {
        path
    };

    match Assets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(Body::from(content.data.into_owned()))
                .unwrap()
        }
        None => {
            // For SPA, serve index.html for unknown routes
            match Assets::get("index.html") {
                Some(content) => Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, "text/html")
                    .body(Body::from(content.data.into_owned()))
                    .unwrap(),
                None => Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Body::from("Not Found"))
                    .unwrap(),
            }
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    // Handle subcommands
    match cli.command {
        Some(Commands::Status) => {
            handle_status();
            return Ok(());
        }
        Some(Commands::Kill) => {
            handle_kill();
            return Ok(());
        }
        None => {}
    }

    // Need a repo path to start the server
    let repo_path = cli.repo_path.unwrap_or_else(|| {
        eprintln!("Usage: git-viewer <REPO_PATH> [--open]");
        eprintln!("       git-viewer status");
        eprintln!("       git-viewer kill");
        eprintln!();
        eprintln!("Examples:");
        eprintln!("  git-viewer .              # View current directory");
        eprintln!("  git-viewer ~/myproject -o # View repo and open browser");
        std::process::exit(1);
    });

    // Check if already running
    if let Some(info) = read_pid_info() {
        if is_process_running(info.pid) {
            eprintln!("✗ git-viewer is already running (PID {})", info.pid);
            eprintln!("  Repo: {}", info.repo_path);
            eprintln!("  URL:  http://127.0.0.1:{}", info.port);
            eprintln!();
            eprintln!("Run 'git-viewer kill' to stop it first.");
            std::process::exit(1);
        } else {
            remove_pid_file();
        }
    }

    // Initialize tracing (quieter for production)
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "warn".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Open the git repository
    let repo = match GitRepository::open(&repo_path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("✗ Failed to open repository: {}", e);
            eprintln!("  Path: {}", repo_path);
            std::process::exit(1);
        }
    };

    let canonical_path = std::fs::canonicalize(&repo_path)
        .unwrap_or_else(|_| PathBuf::from(&repo_path))
        .to_string_lossy()
        .to_string();

    let shared_repo = Arc::new(RwLock::new(repo));

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build the router with API routes and static file serving
    let app = Router::new()
        .merge(routes::create_router(shared_repo))
        .fallback(get(serve_static))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    // Bind to the port
    let addr = format!("127.0.0.1:{}", cli.port);
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("✗ Failed to bind to port {}: {}", cli.port, e);
            eprintln!("  Try a different port with --port <PORT>");
            std::process::exit(1);
        }
    };

    // Write PID file
    let pid_info = PidInfo {
        pid: std::process::id(),
        repo_path: canonical_path.clone(),
        port: cli.port,
    };
    write_pid_info(&pid_info)?;

    // Print startup message
    let url = format!("http://127.0.0.1:{}", cli.port);
    println!();
    println!("  ┌─────────────────────────────────────────────┐");
    println!("  │            Git Repository Viewer            │");
    println!("  └─────────────────────────────────────────────┘");
    println!();
    println!("  Repository: {}", canonical_path);
    println!("  Server:     {}", url);
    println!();
    println!("  Commands:");
    println!("    git-viewer status  - Check if running");
    println!("    git-viewer kill    - Stop the server");
    println!();
    println!("  Press Ctrl+C to stop");
    println!();

    // Open browser if requested
    if cli.open {
        if let Err(e) = open::that(&url) {
            eprintln!("  Warning: Could not open browser: {}", e);
        }
    }

    // Set up graceful shutdown
    let shutdown = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to listen for Ctrl+C");
        println!("\n  Shutting down...");
        remove_pid_file();
    };

    // Start the server with graceful shutdown
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown)
        .await?;

    Ok(())
}
