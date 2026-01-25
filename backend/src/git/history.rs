use git2::{DiffOptions, Repository, Sort};
use std::collections::{HashMap, HashSet};

use crate::error::Result;
use crate::git::repository::{commit_to_info, GitRepository};
use crate::models::{CommitInfo, CommitListResponse, ContributorInfo, DirectoryInfo};

pub fn get_last_commit_for_path(repo: &Repository, path: &str) -> Result<CommitInfo> {
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TIME)?;
    revwalk.push_head()?;

    for oid in revwalk {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;

        // Check if this commit modified the path
        if commit_touches_path(repo, &commit, path)? {
            return Ok(commit_to_info(&commit));
        }
    }

    // Fallback: return the head commit
    let head = repo.head()?;
    let commit = head.peel_to_commit()?;
    Ok(commit_to_info(&commit))
}

/// Get last commit info for multiple paths in a single history walk.
/// Much more efficient than calling get_last_commit_for_path for each path.
pub fn get_last_commits_for_paths(repo: &Repository, paths: &[String]) -> Result<HashMap<String, CommitInfo>> {
    if paths.is_empty() {
        return Ok(HashMap::new());
    }

    let mut results: HashMap<String, CommitInfo> = HashMap::new();
    let mut remaining: HashSet<&str> = paths.iter().map(|s| s.as_str()).collect();

    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TIME)?;
    revwalk.push_head()?;

    for oid in revwalk {
        if remaining.is_empty() {
            break; // Found all paths
        }

        let oid = oid?;
        let commit = repo.find_commit(oid)?;

        // Check which remaining paths this commit touches
        let touched = get_touched_paths(repo, &commit, &remaining)?;

        for path in touched {
            if remaining.remove(path.as_str()) {
                results.insert(path, commit_to_info(&commit));
            }
        }
    }

    // For any paths not found, use HEAD commit as fallback
    if !remaining.is_empty() {
        let head = repo.head()?;
        let commit = head.peel_to_commit()?;
        let fallback_info = commit_to_info(&commit);

        for path in remaining {
            results.insert(path.to_string(), fallback_info.clone());
        }
    }

    Ok(results)
}

/// Check which of the given paths are touched by this commit.
fn get_touched_paths(repo: &Repository, commit: &git2::Commit, paths: &HashSet<&str>) -> Result<Vec<String>> {
    let tree = commit.tree()?;

    let parent_tree = if commit.parent_count() > 0 {
        Some(commit.parent(0)?.tree()?)
    } else {
        None
    };

    let diff = repo.diff_tree_to_tree(
        parent_tree.as_ref(),
        Some(&tree),
        None, // No pathspec filter - we'll check manually
    )?;

    let mut touched = Vec::new();

    for delta in diff.deltas() {
        // Check both old and new paths (for renames)
        if let Some(path) = delta.new_file().path().and_then(|p| p.to_str()) {
            // Check if this path or any parent directory matches our targets
            for &target in paths {
                if path == target || path.starts_with(&format!("{}/", target)) || target.starts_with(&format!("{}/", path)) {
                    if !touched.contains(&target.to_string()) {
                        touched.push(target.to_string());
                    }
                }
            }
        }
        if let Some(path) = delta.old_file().path().and_then(|p| p.to_str()) {
            for &target in paths {
                if path == target || path.starts_with(&format!("{}/", target)) || target.starts_with(&format!("{}/", path)) {
                    if !touched.contains(&target.to_string()) {
                        touched.push(target.to_string());
                    }
                }
            }
        }
    }

    Ok(touched)
}

fn commit_touches_path(repo: &Repository, commit: &git2::Commit, path: &str) -> Result<bool> {
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

impl GitRepository {
    /// Get commits using the cache for fast repeated queries
    pub fn get_commits(
        &self,
        path: Option<&str>,
        limit: usize,
        offset: usize,
        exclude_authors: Option<&[String]>,
    ) -> Result<CommitListResponse> {
        self.with_cache(|cache, repo| {
            let path_key = path.unwrap_or("");
            cache.get_commits_for_path(repo, path_key, limit, offset, exclude_authors)
        })
    }

    pub fn get_directory_info(&self, path: Option<&str>) -> Result<DirectoryInfo> {
        self.with_repo(|repo| {
            let head = repo.head()?;
            let commit = head.peel_to_commit()?;
            let tree = commit.tree()?;

            let target_tree = if let Some(p) = path {
                if p.is_empty() || p == "/" {
                    tree.clone()
                } else {
                    let entry = tree.get_path(std::path::Path::new(p))?;
                    let obj = entry.to_object(repo)?;
                    obj.peel_to_tree()?
                }
            } else {
                tree.clone()
            };

            // Count files and directories, calculate total size
            let (file_count, directory_count, total_size) = count_entries(repo, &target_tree);

            // Get contributors
            let contributors = get_contributors_internal(repo, path)?;

            // Get latest commit
            let latest_commit = get_latest_commit_internal(repo, path)?;

            // Get first commit (oldest)
            let first_commit = get_first_commit_internal(repo, path)?;

            Ok(DirectoryInfo {
                path: path.unwrap_or("").to_string(),
                file_count,
                directory_count,
                total_size,
                contributors,
                first_commit,
                latest_commit,
            })
        })
    }
}

fn get_contributors_internal(repo: &Repository, path: Option<&str>) -> Result<Vec<ContributorInfo>> {
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TIME)?;
    revwalk.push_head()?;

    let mut contributor_map: HashMap<String, (String, usize)> = HashMap::new();

    for oid in revwalk {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;

        if let Some(p) = path {
            if !p.is_empty() && !commit_touches_path(repo, &commit, p)? {
                continue;
            }
        }

        let author = commit.author();
        let email = author.email().unwrap_or("").to_string();
        let name = author.name().unwrap_or("Unknown").to_string();

        contributor_map
            .entry(email.clone())
            .and_modify(|(_, count)| *count += 1)
            .or_insert((name, 1));
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

    Ok(contributors)
}

fn get_latest_commit_internal(repo: &Repository, path: Option<&str>) -> Result<Option<CommitInfo>> {
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TIME)?;
    revwalk.push_head()?;

    for oid in revwalk {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;

        if let Some(p) = path {
            if !p.is_empty() && !commit_touches_path(repo, &commit, p)? {
                continue;
            }
        }

        return Ok(Some(commit_to_info(&commit)));
    }

    Ok(None)
}

fn get_first_commit_internal(repo: &Repository, path: Option<&str>) -> Result<Option<CommitInfo>> {
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TIME | Sort::REVERSE)?;
    revwalk.push_head()?;

    for oid in revwalk {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;

        if let Some(p) = path {
            if !p.is_empty() && !commit_touches_path(repo, &commit, p)? {
                continue;
            }
        }

        return Ok(Some(commit_to_info(&commit)));
    }

    Ok(None)
}

fn count_entries(repo: &Repository, tree: &git2::Tree) -> (usize, usize, u64) {
    let mut file_count = 0;
    let mut dir_count = 0;
    let mut total_size: u64 = 0;

    for entry in tree.iter() {
        match entry.kind() {
            Some(git2::ObjectType::Blob) => {
                file_count += 1;
                if let Ok(obj) = entry.to_object(repo) {
                    if let Some(blob) = obj.as_blob() {
                        total_size += blob.size() as u64;
                    }
                }
            }
            Some(git2::ObjectType::Tree) => {
                dir_count += 1;
                if let Ok(obj) = entry.to_object(repo) {
                    if let Some(subtree) = obj.as_tree() {
                        let (fc, dc, ts) = count_entries(repo, subtree);
                        file_count += fc;
                        dir_count += dc;
                        total_size += ts;
                    }
                }
            }
            _ => {}
        }
    }

    (file_count, dir_count, total_size)
}
