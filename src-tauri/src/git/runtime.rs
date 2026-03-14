use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::{watch, Mutex as AsyncMutex};

use super::models::GitStatusSnapshotOutput;

type SnapshotResult = Result<GitStatusSnapshotOutput, String>;
type SnapshotSender = watch::Sender<Option<SnapshotResult>>;

#[derive(Debug, Clone)]
pub(crate) struct RepositoryCacheEntry {
    pub workspace_path: PathBuf,
    pub repo_root: PathBuf,
}

#[derive(Clone, Default)]
pub struct RepositoryContextCache {
    entries: Arc<Mutex<HashMap<String, RepositoryCacheEntry>>>,
}

impl RepositoryContextCache {
    pub(crate) fn get(&self, repo_path: &str) -> Option<RepositoryCacheEntry> {
        self.lock_entries().get(repo_path).cloned()
    }

    pub(crate) fn insert(&self, repo_path: String, entry: RepositoryCacheEntry) {
        self.lock_entries().insert(repo_path, entry);
    }

    pub(crate) fn remove(&self, repo_path: &str) {
        self.lock_entries().remove(repo_path);
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.lock_entries().len()
    }

    fn lock_entries(&self) -> MutexGuard<'_, HashMap<String, RepositoryCacheEntry>> {
        match self.entries.lock() {
            Ok(entries) => entries,
            Err(poisoned) => poisoned.into_inner(),
        }
    }
}

#[derive(Clone, Default)]
pub struct GitRuntimeState {
    repository_cache: RepositoryContextCache,
    inflight_snapshots: Arc<AsyncMutex<HashMap<String, SnapshotSender>>>,
}

impl GitRuntimeState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn repository_cache(&self) -> RepositoryContextCache {
        self.repository_cache.clone()
    }

    pub async fn run_status_snapshot<Fut>(&self, repo_key: String, task: Fut) -> SnapshotResult
    where
        Fut: Future<Output = SnapshotResult>,
    {
        if let Some(receiver) = self.subscribe_snapshot(&repo_key).await {
            return await_snapshot(receiver).await;
        }

        let result = task.await;
        self.publish_snapshot(&repo_key, result.clone()).await;
        result
    }

    async fn subscribe_snapshot(
        &self,
        repo_key: &str,
    ) -> Option<watch::Receiver<Option<SnapshotResult>>> {
        let mut inflight_snapshots = self.inflight_snapshots.lock().await;
        if let Some(sender) = inflight_snapshots.get(repo_key) {
            return Some(sender.subscribe());
        }

        let (sender, _) = watch::channel(None);
        inflight_snapshots.insert(repo_key.to_string(), sender);
        None
    }

    async fn publish_snapshot(&self, repo_key: &str, result: SnapshotResult) {
        let sender = {
            let inflight_snapshots = self.inflight_snapshots.lock().await;
            inflight_snapshots.get(repo_key).cloned()
        };
        if let Some(sender) = sender {
            let _ = sender.send(Some(result));
        }

        let mut inflight_snapshots = self.inflight_snapshots.lock().await;
        inflight_snapshots.remove(repo_key);
    }
}

async fn await_snapshot(mut receiver: watch::Receiver<Option<SnapshotResult>>) -> SnapshotResult {
    if let Some(result) = receiver.borrow().clone() {
        return result;
    }

    receiver
        .changed()
        .await
        .map_err(|_| "Git 状态请求意外中止。".to_string())?;
    receiver
        .borrow()
        .clone()
        .ok_or_else(|| "Git 状态结果缺失。".to_string())?
}

#[cfg(test)]
mod tests {
    use super::GitRuntimeState;
    use super::SnapshotResult;
    use crate::git::models::{GitBranchSummary, GitStatusSnapshotOutput};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    fn sample_snapshot() -> GitStatusSnapshotOutput {
        GitStatusSnapshotOutput {
            is_repository: true,
            repo_root: Some("/tmp/repo".to_string()),
            branch: Some(GitBranchSummary {
                head: Some("main".to_string()),
                upstream: Some("origin/main".to_string()),
                ahead: 1,
                behind: 0,
                detached: false,
            }),
            remote_name: Some("origin".to_string()),
            staged: Vec::new(),
            unstaged: Vec::new(),
            untracked: Vec::new(),
            conflicted: Vec::new(),
            is_clean: true,
        }
    }

    async fn delayed_snapshot(counter: Arc<AtomicUsize>) -> SnapshotResult {
        counter.fetch_add(1, Ordering::SeqCst);
        tokio::time::sleep(Duration::from_millis(25)).await;
        Ok(sample_snapshot())
    }

    #[tokio::test]
    async fn coalesces_inflight_status_requests() {
        let runtime = GitRuntimeState::new();
        let counter = Arc::new(AtomicUsize::new(0));
        let first =
            runtime.run_status_snapshot("repo".to_string(), delayed_snapshot(counter.clone()));
        tokio::task::yield_now().await;
        let second =
            runtime.run_status_snapshot("repo".to_string(), delayed_snapshot(counter.clone()));

        let (left, right) = tokio::join!(first, second);

        assert_eq!(counter.load(Ordering::SeqCst), 1);
        assert_eq!(
            left.expect("first snapshot").remote_name.as_deref(),
            Some("origin")
        );
        assert_eq!(
            right.expect("second snapshot").remote_name.as_deref(),
            Some("origin")
        );
    }
}
