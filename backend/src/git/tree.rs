use git2::ObjectType;
use std::path::Path;

use crate::error::{AppError, Result};
use crate::git::history::get_last_commits_for_paths;
use crate::git::repository::GitRepository;
use crate::models::{EntryType, FullTreeEntry, TreeEntry};

impl GitRepository {
    pub fn get_tree_entries(&self, path: Option<&str>, include_last_commit: bool) -> Result<Vec<TreeEntry>> {
        self.with_repo(|repo| {
            let head = repo.head()?;
            let commit = head.peel_to_commit()?;
            let tree = commit.tree()?;

            let target_tree = if let Some(p) = path {
                if p.is_empty() || p == "/" {
                    tree
                } else {
                    let entry = tree.get_path(Path::new(p))
                        .map_err(|_| AppError::PathNotFound(p.to_string()))?;
                    let obj = entry.to_object(repo)?;
                    obj.peel_to_tree()
                        .map_err(|_| AppError::InvalidPath(format!("{} is not a directory", p)))?
                }
            } else {
                tree
            };

            let base_path = path.unwrap_or("");
            let mut entries = Vec::new();

            // First pass: collect all entries without commit info
            for entry in target_tree.iter() {
                let name = entry.name().unwrap_or("").to_string();
                let entry_path = if base_path.is_empty() {
                    name.clone()
                } else {
                    format!("{}/{}", base_path, name)
                };

                let entry_type = match entry.kind() {
                    Some(ObjectType::Blob) => EntryType::File,
                    Some(ObjectType::Tree) => EntryType::Directory,
                    Some(ObjectType::Commit) => EntryType::Submodule,
                    _ => continue,
                };

                let size = if entry_type == EntryType::File {
                    entry.to_object(repo).ok().and_then(|obj| {
                        obj.as_blob().map(|b| b.size() as u64)
                    })
                } else {
                    None
                };

                entries.push(TreeEntry {
                    name,
                    path: entry_path,
                    entry_type,
                    size,
                    last_commit: None,
                });
            }

            // Second pass: batch fetch commit info for all paths at once
            if include_last_commit {
                let paths: Vec<String> = entries.iter().map(|e| e.path.clone()).collect();
                let commit_map = get_last_commits_for_paths(repo, &paths)?;

                for entry in &mut entries {
                    entry.last_commit = commit_map.get(&entry.path).cloned();
                }
            }

            // Sort: directories first, then files, alphabetically
            entries.sort_by(|a, b| {
                match (&a.entry_type, &b.entry_type) {
                    (EntryType::Directory, EntryType::Directory) => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                    (EntryType::Directory, _) => std::cmp::Ordering::Less,
                    (_, EntryType::Directory) => std::cmp::Ordering::Greater,
                    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                }
            });

            Ok(entries)
        })
    }

    pub fn get_full_tree(&self) -> Result<Vec<FullTreeEntry>> {
        self.with_repo(|repo| {
            let head = repo.head()?;
            let commit = head.peel_to_commit()?;
            let tree = commit.tree()?;

            fn build_tree(repo: &git2::Repository, tree: &git2::Tree, base_path: &str) -> Vec<FullTreeEntry> {
                let mut entries = Vec::new();

                for entry in tree.iter() {
                    let name = entry.name().unwrap_or("").to_string();
                    let path = if base_path.is_empty() {
                        name.clone()
                    } else {
                        format!("{}/{}", base_path, name)
                    };

                    let entry_type = match entry.kind() {
                        Some(ObjectType::Blob) => EntryType::File,
                        Some(ObjectType::Tree) => EntryType::Directory,
                        Some(ObjectType::Commit) => EntryType::Submodule,
                        _ => continue,
                    };

                    let children = if entry_type == EntryType::Directory {
                        entry.to_object(repo).ok().and_then(|obj| {
                            obj.as_tree().map(|t| build_tree(repo, t, &path))
                        })
                    } else {
                        None
                    };

                    entries.push(FullTreeEntry {
                        name,
                        path,
                        entry_type,
                        children,
                    });
                }

                // Sort: directories first, then files
                entries.sort_by(|a, b| {
                    match (&a.entry_type, &b.entry_type) {
                        (EntryType::Directory, EntryType::Directory) => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                        (EntryType::Directory, _) => std::cmp::Ordering::Less,
                        (_, EntryType::Directory) => std::cmp::Ordering::Greater,
                        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                    }
                });

                entries
            }

            Ok(build_tree(repo, &tree, ""))
        })
    }

    pub fn get_file_content(&self, path: &str) -> Result<String> {
        self.with_repo(|repo| {
            let head = repo.head()?;
            let commit = head.peel_to_commit()?;
            let tree = commit.tree()?;

            let entry = tree.get_path(Path::new(path))
                .map_err(|_| AppError::PathNotFound(path.to_string()))?;

            let obj = entry.to_object(repo)?;
            let blob = obj.as_blob()
                .ok_or_else(|| AppError::InvalidPath(format!("{} is not a file", path)))?;

            String::from_utf8(blob.content().to_vec())
                .map_err(|_| AppError::Internal("File is not valid UTF-8".to_string()))
        })
    }
}
