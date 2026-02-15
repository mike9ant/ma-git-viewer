//! Diff generation between commits.
//!
//! Generates detailed diffs with:
//! - File-level changes (added, modified, deleted, renamed)
//! - Hunks with line-by-line additions/deletions
//! - Full file contents (old and new) for side-by-side view
//! - Author attribution per file (who touched each file between commits)
//!
//! `get_file_authors_between_commits()` walks intermediate commits to track
//! which authors modified each file, enabling contributor filtering in diff view.
//!
//! Supports frontend: DiffViewer modal with split/unified view, author badges

use git2::{Delta, DiffOptions, Repository, Sort};
use std::collections::HashMap;
use std::path::Path;

use crate::error::{AppError, Result};
use crate::git::repository::GitRepository;
use crate::models::{AuthorInfo, DiffHunk, DiffLine, DiffResponse, DiffStats, DiffStatus, FileAuthorInfo, FileDiff, LineType, WorkingTreeStatus};

impl GitRepository {
    pub fn get_diff(
        &self,
        from_commit: Option<&str>,
        to_commit: &str,
        path: Option<&str>,
    ) -> Result<DiffResponse> {
        // Convert to owned strings for the closure
        let from_commit_owned = from_commit.map(|s| s.to_string());
        let to_commit_owned = to_commit.to_string();
        let path_owned = path.map(|s| s.to_string());

        self.with_repo(|repo| {
            let to_oid = git2::Oid::from_str(&to_commit_owned)
                .map_err(|_| AppError::CommitNotFound(to_commit_owned.clone()))?;
            let to = repo.find_commit(to_oid)
                .map_err(|_| AppError::CommitNotFound(to_commit_owned.clone()))?;
            let to_tree = to.tree()?;

            let from_tree = if let Some(ref from_oid_str) = from_commit_owned {
                let from_oid = git2::Oid::from_str(from_oid_str)
                    .map_err(|_| AppError::CommitNotFound(from_oid_str.clone()))?;
                let from = repo.find_commit(from_oid)
                    .map_err(|_| AppError::CommitNotFound(from_oid_str.clone()))?;
                Some(from.tree()?)
            } else if to.parent_count() > 0 {
                Some(to.parent(0)?.tree()?)
            } else {
                None
            };

            let mut opts = DiffOptions::new();
            opts.context_lines(3);

            if let Some(ref p) = path_owned {
                if !p.is_empty() {
                    opts.pathspec(p);
                }
            }

            let diff = repo.diff_tree_to_tree(
                from_tree.as_ref(),
                Some(&to_tree),
                Some(&mut opts),
            )?;

            let mut files: Vec<FileDiff> = Vec::new();
            let mut stats = DiffStats::default();

            for (delta_idx, delta) in diff.deltas().enumerate() {
                let status = match delta.status() {
                    Delta::Added => DiffStatus::Added,
                    Delta::Deleted => DiffStatus::Deleted,
                    Delta::Modified => DiffStatus::Modified,
                    Delta::Renamed => DiffStatus::Renamed,
                    Delta::Copied => DiffStatus::Copied,
                    Delta::Typechange => DiffStatus::TypeChanged,
                    _ => DiffStatus::Unmodified,
                };

                let old_path = delta.old_file().path().map(|p| p.to_string_lossy().to_string());
                let new_path = delta.new_file().path().map(|p| p.to_string_lossy().to_string());

                let is_binary = delta.flags().is_binary();

                // Get file contents
                let old_content = if !is_binary {
                    old_path.as_ref().and_then(|p| {
                        from_tree.as_ref().and_then(|tree| {
                            get_blob_content(repo, tree, p).ok()
                        })
                    })
                } else {
                    None
                };

                let new_content = if !is_binary {
                    new_path.as_ref().and_then(|p| {
                        get_blob_content(repo, &to_tree, p).ok()
                    })
                } else {
                    None
                };

                // Get hunks
                let mut hunks: Vec<DiffHunk> = Vec::new();
                let patch = git2::Patch::from_diff(&diff, delta_idx)?;

                if let Some(patch) = patch {
                    for hunk_idx in 0..patch.num_hunks() {
                        let (hunk, _) = patch.hunk(hunk_idx)?;

                        let mut lines: Vec<DiffLine> = Vec::new();

                        for line_idx in 0..patch.num_lines_in_hunk(hunk_idx)? {
                            let line = patch.line_in_hunk(hunk_idx, line_idx)?;

                            let line_type = match line.origin() {
                                '+' => {
                                    stats.insertions += 1;
                                    LineType::Addition
                                }
                                '-' => {
                                    stats.deletions += 1;
                                    LineType::Deletion
                                }
                                ' ' => LineType::Context,
                                _ => LineType::Header,
                            };

                            let content = String::from_utf8_lossy(line.content()).to_string();

                            lines.push(DiffLine {
                                line_type,
                                old_lineno: line.old_lineno(),
                                new_lineno: line.new_lineno(),
                                content,
                            });
                        }

                        hunks.push(DiffHunk {
                            old_start: hunk.old_start(),
                            old_lines: hunk.old_lines(),
                            new_start: hunk.new_start(),
                            new_lines: hunk.new_lines(),
                            header: String::from_utf8_lossy(hunk.header()).to_string(),
                            lines,
                        });
                    }
                }

                files.push(FileDiff {
                    old_path,
                    new_path,
                    status,
                    hunks,
                    old_content,
                    new_content,
                    is_binary,
                    authors: Vec::new(),
                    biggest_change_author: None,
                });

                stats.files_changed += 1;
            }

            // Get author information for files between the commits
            let from_oid = from_commit_owned.as_ref()
                .and_then(|s| git2::Oid::from_str(s).ok());

            let file_authors = get_file_authors_between_commits(
                repo,
                from_oid,
                to_oid,
                path_owned.as_deref(),
            )?;

            // Collect all unique contributors
            let mut all_contributors: HashMap<String, AuthorInfo> = HashMap::new();

            // Enrich files with author info
            for file in &mut files {
                let file_path = file.new_path.as_ref()
                    .or(file.old_path.as_ref());

                if let Some(path) = file_path {
                    if let Some(authors) = file_authors.get(path) {
                        file.authors = authors.clone();
                        file.biggest_change_author = authors.first().map(|a| a.email.clone());

                        // Add to contributors list
                        for author in authors {
                            all_contributors.entry(author.email.clone()).or_insert_with(|| AuthorInfo {
                                name: author.name.clone(),
                                email: author.email.clone(),
                            });
                        }
                    }
                }
            }

            // Sort contributors by name
            let mut contributors: Vec<AuthorInfo> = all_contributors.into_values().collect();
            contributors.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

            let total_files = files.len();

            Ok(DiffResponse {
                from_commit: from_commit_owned,
                to_commit: to_commit_owned,
                path: path_owned,
                files,
                stats,
                contributors,
                total_files,
                filtered_files: total_files,
            })
        })
    }

    pub fn get_diff_between_commits(
        &self,
        from_commit: &str,
        to_commit: &str,
        path: Option<&str>,
    ) -> Result<DiffResponse> {
        self.get_diff(Some(from_commit), to_commit, path)
    }

    pub fn get_working_tree_status(&self, path: Option<&str>) -> Result<WorkingTreeStatus> {
        self.with_repo(|repo| {
            // Bare or empty repos have no working tree
            if repo.is_bare() || repo.head().is_err() {
                return Ok(WorkingTreeStatus {
                    has_changes: false,
                    files_changed: 0,
                });
            }

            let mut opts = git2::StatusOptions::new();
            opts.include_untracked(true)
                .recurse_untracked_dirs(true)
                .include_ignored(false);

            if let Some(p) = path {
                if !p.is_empty() {
                    opts.pathspec(p);
                }
            }

            let statuses = repo.statuses(Some(&mut opts))?;
            let files_changed = statuses.len();

            Ok(WorkingTreeStatus {
                has_changes: files_changed > 0,
                files_changed,
            })
        })
    }

    pub fn get_working_tree_diff(&self, path: Option<&str>) -> Result<DiffResponse> {
        let path_owned = path.map(|s| s.to_string());

        self.with_repo(|repo| {
            // Bare repos have no working tree
            let workdir = repo.workdir()
                .ok_or_else(|| AppError::Internal("Repository has no working directory".to_string()))?
                .to_path_buf();

            let head_commit = repo.head()
                .map_err(|_| AppError::Internal("No HEAD found".to_string()))?
                .peel_to_commit()
                .map_err(|_| AppError::Internal("Cannot resolve HEAD to commit".to_string()))?;
            let head_tree = head_commit.tree()?;
            let head_oid = head_commit.id().to_string();

            let mut opts = DiffOptions::new();
            opts.context_lines(3)
                .include_untracked(true)
                .recurse_untracked_dirs(true);

            if let Some(ref p) = path_owned {
                if !p.is_empty() {
                    opts.pathspec(p);
                }
            }

            let diff = repo.diff_tree_to_workdir_with_index(
                Some(&head_tree),
                Some(&mut opts),
            )?;

            let mut files: Vec<FileDiff> = Vec::new();
            let mut stats = DiffStats::default();

            for (delta_idx, delta) in diff.deltas().enumerate() {
                let status = match delta.status() {
                    Delta::Added => DiffStatus::Added,
                    Delta::Deleted => DiffStatus::Deleted,
                    Delta::Modified => DiffStatus::Modified,
                    Delta::Renamed => DiffStatus::Renamed,
                    Delta::Copied => DiffStatus::Copied,
                    Delta::Typechange => DiffStatus::TypeChanged,
                    _ => DiffStatus::Unmodified,
                };

                let old_path = delta.old_file().path().map(|p| p.to_string_lossy().to_string());
                let new_path = delta.new_file().path().map(|p| p.to_string_lossy().to_string());

                let is_binary = delta.flags().is_binary();

                // Old content from HEAD tree
                let old_content = if !is_binary {
                    old_path.as_ref().and_then(|p| {
                        get_blob_content(repo, &head_tree, p).ok()
                    })
                } else {
                    None
                };

                // New content from working directory
                let new_content = if !is_binary {
                    new_path.as_ref().and_then(|p| {
                        let full_path = workdir.join(p);
                        std::fs::read_to_string(&full_path).ok()
                    })
                } else {
                    None
                };

                // Get hunks
                let mut hunks: Vec<DiffHunk> = Vec::new();
                let patch = git2::Patch::from_diff(&diff, delta_idx)?;

                if let Some(patch) = patch {
                    for hunk_idx in 0..patch.num_hunks() {
                        let (hunk, _) = patch.hunk(hunk_idx)?;

                        let mut lines: Vec<DiffLine> = Vec::new();

                        for line_idx in 0..patch.num_lines_in_hunk(hunk_idx)? {
                            let line = patch.line_in_hunk(hunk_idx, line_idx)?;

                            let line_type = match line.origin() {
                                '+' => {
                                    stats.insertions += 1;
                                    LineType::Addition
                                }
                                '-' => {
                                    stats.deletions += 1;
                                    LineType::Deletion
                                }
                                ' ' => LineType::Context,
                                _ => LineType::Header,
                            };

                            let content = String::from_utf8_lossy(line.content()).to_string();

                            lines.push(DiffLine {
                                line_type,
                                old_lineno: line.old_lineno(),
                                new_lineno: line.new_lineno(),
                                content,
                            });
                        }

                        hunks.push(DiffHunk {
                            old_start: hunk.old_start(),
                            old_lines: hunk.old_lines(),
                            new_start: hunk.new_start(),
                            new_lines: hunk.new_lines(),
                            header: String::from_utf8_lossy(hunk.header()).to_string(),
                            lines,
                        });
                    }
                }

                files.push(FileDiff {
                    old_path,
                    new_path,
                    status,
                    hunks,
                    old_content,
                    new_content,
                    is_binary,
                    authors: Vec::new(),
                    biggest_change_author: None,
                });

                stats.files_changed += 1;
            }

            let total_files = files.len();

            Ok(DiffResponse {
                from_commit: Some(head_oid),
                to_commit: "WORKING_TREE".to_string(),
                path: path_owned,
                files,
                stats,
                contributors: Vec::new(),
                total_files,
                filtered_files: total_files,
            })
        })
    }
}

fn get_blob_content(repo: &Repository, tree: &git2::Tree, path: &str) -> Result<String> {
    let entry = tree.get_path(Path::new(path))
        .map_err(|_| AppError::PathNotFound(path.to_string()))?;

    let obj = entry.to_object(repo)?;
    let blob = obj.as_blob()
        .ok_or_else(|| AppError::InvalidPath(format!("{} is not a file", path)))?;

    String::from_utf8(blob.content().to_vec())
        .map_err(|_| AppError::Internal("File is not valid UTF-8".to_string()))
}

/// Track author info for a specific file during intermediate commits analysis
#[derive(Debug, Clone)]
struct AuthorCommitInfo {
    email: String,
    name: String,
    commit_count: usize,
    last_commit_timestamp: i64,
}

/// Walk commits between from_commit and to_commit, building a map of which authors touched each file
fn get_file_authors_between_commits(
    repo: &Repository,
    from_oid: Option<git2::Oid>,
    to_oid: git2::Oid,
    path_filter: Option<&str>,
) -> Result<HashMap<String, Vec<FileAuthorInfo>>> {
    let mut file_authors: HashMap<String, HashMap<String, AuthorCommitInfo>> = HashMap::new();

    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    revwalk.push(to_oid)?;

    // If we have a from_oid, hide it and its ancestors
    if let Some(from) = from_oid {
        revwalk.hide(from)?;
    }

    for oid_result in revwalk {
        let oid = oid_result?;
        let commit = repo.find_commit(oid)?;

        // Get author info
        let author = commit.author();
        let author_email = author.email().unwrap_or("").to_string();
        let author_name = author.name().unwrap_or("Unknown").to_string();
        let timestamp = commit.time().seconds();

        // Get parent tree (or empty tree for root commits)
        let parent_tree = if commit.parent_count() > 0 {
            Some(commit.parent(0)?.tree()?)
        } else {
            None
        };

        let commit_tree = commit.tree()?;

        // Diff this commit against its parent
        let mut diff_opts = DiffOptions::new();
        if let Some(p) = path_filter {
            if !p.is_empty() {
                diff_opts.pathspec(p);
            }
        }

        let diff = repo.diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&commit_tree),
            Some(&mut diff_opts),
        )?;

        // Track which files this commit touched
        for delta in diff.deltas() {
            let file_path = delta.new_file().path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string());

            if let Some(path) = file_path {
                let author_map = file_authors.entry(path).or_insert_with(HashMap::new);

                let entry = author_map.entry(author_email.clone()).or_insert_with(|| AuthorCommitInfo {
                    email: author_email.clone(),
                    name: author_name.clone(),
                    commit_count: 0,
                    last_commit_timestamp: timestamp,
                });

                entry.commit_count += 1;
                // Keep the most recent timestamp
                if timestamp > entry.last_commit_timestamp {
                    entry.last_commit_timestamp = timestamp;
                }
            }
        }
    }

    // Convert to final format, sorting by commit count descending
    let mut result: HashMap<String, Vec<FileAuthorInfo>> = HashMap::new();

    for (path, author_map) in file_authors {
        let mut authors: Vec<FileAuthorInfo> = author_map.into_values()
            .map(|info| FileAuthorInfo {
                email: info.email,
                name: info.name,
                commit_count: info.commit_count,
                last_commit_timestamp: info.last_commit_timestamp,
            })
            .collect();

        // Sort by commit count descending, then by timestamp descending
        authors.sort_by(|a, b| {
            b.commit_count.cmp(&a.commit_count)
                .then_with(|| b.last_commit_timestamp.cmp(&a.last_commit_timestamp))
        });

        result.insert(path, authors);
    }

    Ok(result)
}
