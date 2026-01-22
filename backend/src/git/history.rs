use git2::{DiffOptions, Repository, Sort};
use std::collections::HashMap;

use crate::error::Result;
use crate::git::repository::{commit_to_info, format_relative_time, GitRepository};
use crate::models::{AuthorInfo, CommitDetail, CommitInfo, CommitListResponse, ContributorInfo, DirectoryInfo};

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
    pub fn get_commits(&self, path: Option<&str>, limit: usize, offset: usize) -> Result<CommitListResponse> {
        self.with_repo(|repo| {
            let mut revwalk = repo.revwalk()?;
            revwalk.set_sorting(Sort::TIME)?;
            revwalk.push_head()?;

            let mut commits = Vec::new();
            let mut count = 0;
            let mut total = 0;

            for oid in revwalk {
                let oid = oid?;
                let commit = repo.find_commit(oid)?;

                // If path filter is specified, check if commit touches the path
                if let Some(p) = path {
                    if !p.is_empty() && !commit_touches_path(repo, &commit, p)? {
                        continue;
                    }
                }

                total += 1;

                if count < offset {
                    count += 1;
                    continue;
                }

                if commits.len() >= limit {
                    continue; // Keep counting total
                }

                let author = commit.author();
                let committer = commit.committer();

                commits.push(CommitDetail {
                    oid: commit.id().to_string(),
                    message: commit.message().unwrap_or("").trim().to_string(),
                    author: AuthorInfo {
                        name: author.name().unwrap_or("Unknown").to_string(),
                        email: author.email().unwrap_or("").to_string(),
                    },
                    committer: AuthorInfo {
                        name: committer.name().unwrap_or("Unknown").to_string(),
                        email: committer.email().unwrap_or("").to_string(),
                    },
                    timestamp: commit.time().seconds(),
                    relative_time: format_relative_time(commit.time().seconds()),
                    parent_count: commit.parent_count(),
                    parents: commit.parent_ids().map(|id| id.to_string()).collect(),
                });

                count += 1;
            }

            Ok(CommitListResponse {
                commits,
                total,
                has_more: total > offset + limit,
            })
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
