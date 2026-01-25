//! Git operations module - core git functionality using libgit2.
//!
//! Submodules:
//! - `repository`: Thread-safe git repository wrapper and basic operations
//! - `cache`: In-memory commit cache for fast history queries
//! - `tree`: File tree traversal and content retrieval
//! - `history`: Commit history with path filtering and author attribution
//! - `diff`: Diff generation between commits with author info per file

pub mod cache;
pub mod diff;
pub mod history;
pub mod repository;
pub mod tree;

pub use repository::{GitRepository, SharedRepo};
