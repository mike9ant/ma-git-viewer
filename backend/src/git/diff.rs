use git2::{Delta, DiffOptions, Repository};
use std::path::Path;

use crate::error::{AppError, Result};
use crate::git::repository::GitRepository;
use crate::models::{DiffHunk, DiffLine, DiffResponse, DiffStats, DiffStatus, FileDiff, LineType};

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
                });

                stats.files_changed += 1;
            }

            Ok(DiffResponse {
                from_commit: from_commit_owned,
                to_commit: to_commit_owned,
                path: path_owned,
                files,
                stats,
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
