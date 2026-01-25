//! Commit cache for fast history queries.
//!
//! Provides in-memory caching of commit history to avoid repeated git walks.
//! - Global cache: All commits loaded once (~1-3s for 30K commits)
//! - Path indices: Built lazily per path, then instant lookups
//! - Cache invalidation: Checks HEAD on each request
//!
//! Performance: First query for a path is slow (walks history), subsequent
//! queries are instant (in-memory filtering). Author filtering and pagination
//! operate on cached data.
//!
//! Used by: `GitRepository::get_commits()` in history.rs
//! Supports: HistoryTab commit list, contributor filtering

use git2::{Oid, Repository, Sort};
use std::collections::HashMap;
use std::time::Instant;

use crate::error::Result;
use crate::models::{AuthorInfo, CommitDetail, CommitListResponse, ContributorInfo};
use crate::git::repository::format_relative_time;

/// Cached commit data - stores all info needed for API responses
#[derive(Debug, Clone)]
pub struct CachedCommit {
    pub oid: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub committer_name: String,
    pub committer_email: String,
    pub timestamp: i64,
    pub parent_count: usize,
    pub parents: Vec<String>,
}

impl CachedCommit {
    /// Convert to API response format
    pub fn to_commit_detail(&self) -> CommitDetail {
        CommitDetail {
            oid: self.oid.clone(),
            message: self.message.clone(),
            author: AuthorInfo {
                name: self.author_name.clone(),
                email: self.author_email.clone(),
            },
            committer: AuthorInfo {
                name: self.committer_name.clone(),
                email: self.committer_email.clone(),
            },
            timestamp: self.timestamp,
            relative_time: format_relative_time(self.timestamp),
            parent_count: self.parent_count,
            parents: self.parents.clone(),
        }
    }
}

/// Cached path data - indices into all_commits plus contributor info
#[derive(Debug, Clone)]
pub struct PathCache {
    /// Indices into CommitCache::all_commits for commits touching this path
    pub commit_indices: Vec<usize>,
    /// Contributors for this path, sorted by commit count
    pub contributors: Vec<ContributorInfo>,
}

/// Main commit cache structure
pub struct CommitCache {
    /// All commits in time order (newest first)
    pub all_commits: Vec<CachedCommit>,

    /// path -> cached data (lazily populated)
    /// Empty string "" key stores root path (all commits)
    pub path_cache: HashMap<String, PathCache>,

    /// HEAD commit OID when cache was built
    pub head_oid: Oid,

    /// When the cache was created
    pub created_at: Instant,
}

impl CommitCache {
    /// Build initial cache by walking all commits (metadata only, no path computation)
    pub fn build(repo: &Repository) -> Result<Self> {
        let head = repo.head()?;
        let head_oid = head.peel_to_commit()?.id();

        let mut revwalk = repo.revwalk()?;
        revwalk.set_sorting(Sort::TIME)?;
        revwalk.push_head()?;

        let mut all_commits = Vec::new();

        for oid_result in revwalk {
            let oid = oid_result?;
            let commit = repo.find_commit(oid)?;

            let author = commit.author();
            let committer = commit.committer();

            all_commits.push(CachedCommit {
                oid: commit.id().to_string(),
                message: commit.message().unwrap_or("").trim().to_string(),
                author_name: author.name().unwrap_or("Unknown").to_string(),
                author_email: author.email().unwrap_or("").to_string(),
                committer_name: committer.name().unwrap_or("Unknown").to_string(),
                committer_email: committer.email().unwrap_or("").to_string(),
                timestamp: commit.time().seconds(),
                parent_count: commit.parent_count(),
                parents: commit.parent_ids().map(|id| id.to_string()).collect(),
            });
        }

        // Pre-populate root path cache (all commits, no filtering needed)
        let mut path_cache = HashMap::new();
        let root_cache = Self::build_root_path_cache(&all_commits);
        path_cache.insert(String::new(), root_cache);

        Ok(Self {
            all_commits,
            path_cache,
            head_oid,
            created_at: Instant::now(),
        })
    }

    /// Build cache entry for root path (all commits)
    fn build_root_path_cache(all_commits: &[CachedCommit]) -> PathCache {
        let commit_indices: Vec<usize> = (0..all_commits.len()).collect();

        // Build contributor map
        let mut contributor_map: HashMap<String, (String, usize)> = HashMap::new();
        for commit in all_commits {
            contributor_map
                .entry(commit.author_email.clone())
                .and_modify(|(_, count)| *count += 1)
                .or_insert((commit.author_name.clone(), 1));
        }

        let mut contributors: Vec<ContributorInfo> = contributor_map
            .into_iter()
            .map(|(email, (name, count))| ContributorInfo {
                name,
                email,
                commit_count: count,
            })
            .collect();
        contributors.sort_by(|a, b| b.commit_count.cmp(&a.commit_count));

        PathCache {
            commit_indices,
            contributors,
        }
    }

    /// Check if cache is still valid
    pub fn is_valid(&self, repo: &Repository) -> bool {
        match repo.head().and_then(|h| h.peel_to_commit()) {
            Ok(head_commit) => head_commit.id() == self.head_oid,
            Err(_) => false,
        }
    }

    /// Get or build path cache entry, then query commits with filtering
    ///
    /// This combined method avoids borrow checker issues by handling the
    /// mutable cache update and immutable query in one place.
    pub fn get_commits_for_path(
        &mut self,
        repo: &Repository,
        path: &str,
        limit: usize,
        offset: usize,
        exclude_authors: Option<&[String]>,
    ) -> Result<CommitListResponse> {
        // Build path cache if needed
        if !self.path_cache.contains_key(path) {
            tracing::info!("Building path cache for: {}", if path.is_empty() { "(root)" } else { path });
            let start = std::time::Instant::now();
            let path_cache = self.build_path_cache(repo, path)?;
            tracing::info!(
                "Path cache built: {} commits in {:?}",
                path_cache.commit_indices.len(),
                start.elapsed()
            );
            self.path_cache.insert(path.to_string(), path_cache);
        }

        // Now we can safely borrow immutably for the query
        let path_cache = self.path_cache.get(path).unwrap();
        Ok(self.query_commits(path_cache, limit, offset, exclude_authors))
    }

    /// Build cache entry for a specific path (expensive - calls git diff for each commit)
    fn build_path_cache(&self, repo: &Repository, path: &str) -> Result<PathCache> {
        let mut commit_indices = Vec::new();
        let mut contributor_map: HashMap<String, (String, usize)> = HashMap::new();

        for (idx, cached_commit) in self.all_commits.iter().enumerate() {
            // Check if this commit touches the path
            let oid = Oid::from_str(&cached_commit.oid)?;
            let commit = repo.find_commit(oid)?;

            if commit_touches_path(repo, &commit, path)? {
                commit_indices.push(idx);

                contributor_map
                    .entry(cached_commit.author_email.clone())
                    .and_modify(|(_, count)| *count += 1)
                    .or_insert((cached_commit.author_name.clone(), 1));
            }
        }

        let mut contributors: Vec<ContributorInfo> = contributor_map
            .into_iter()
            .map(|(email, (name, count))| ContributorInfo {
                name,
                email,
                commit_count: count,
            })
            .collect();
        contributors.sort_by(|a, b| b.commit_count.cmp(&a.commit_count));

        Ok(PathCache {
            commit_indices,
            contributors,
        })
    }

    /// Query commits with filtering and pagination (fast - all in-memory)
    pub fn query_commits(
        &self,
        path_cache: &PathCache,
        limit: usize,
        offset: usize,
        exclude_authors: Option<&[String]>,
    ) -> CommitListResponse {
        let exclude_set: std::collections::HashSet<&str> = exclude_authors
            .map(|authors| authors.iter().map(|s| s.as_str()).collect())
            .unwrap_or_default();

        let total = path_cache.commit_indices.len();

        // Filter by author if needed
        let filtered_indices: Vec<usize> = if exclude_set.is_empty() {
            path_cache.commit_indices.clone()
        } else {
            path_cache.commit_indices
                .iter()
                .filter(|&&idx| !exclude_set.contains(self.all_commits[idx].author_email.as_str()))
                .copied()
                .collect()
        };

        let filtered_total = filtered_indices.len();

        // Apply pagination
        let commits: Vec<CommitDetail> = filtered_indices
            .iter()
            .skip(offset)
            .take(limit)
            .map(|&idx| self.all_commits[idx].to_commit_detail())
            .collect();

        // Get contributors (convert from ContributorInfo to AuthorInfo for response)
        let contributors: Vec<AuthorInfo> = path_cache.contributors
            .iter()
            .map(|c| AuthorInfo {
                name: c.name.clone(),
                email: c.email.clone(),
            })
            .collect();

        CommitListResponse {
            commits,
            total,
            filtered_total,
            has_more: filtered_total > offset + limit,
            contributors,
        }
    }

    /// Get cache statistics for debugging
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            total_commits: self.all_commits.len(),
            cached_paths: self.path_cache.len(),
            age_secs: self.created_at.elapsed().as_secs(),
        }
    }
}

#[derive(Debug)]
pub struct CacheStats {
    pub total_commits: usize,
    pub cached_paths: usize,
    pub age_secs: u64,
}

/// Check if a commit touches the given path (copied from history.rs to avoid circular dep)
fn commit_touches_path(repo: &Repository, commit: &git2::Commit, path: &str) -> Result<bool> {
    use git2::DiffOptions;

    let tree = commit.tree()?;

    let parent_tree = if commit.parent_count() > 0 {
        Some(commit.parent(0)?.tree()?)
    } else {
        None
    };

    let mut opts = DiffOptions::new();
    opts.pathspec(path);

    let diff = repo.diff_tree_to_tree(
        parent_tree.as_ref(),
        Some(&tree),
        Some(&mut opts),
    )?;

    Ok(diff.deltas().len() > 0)
}
