use std::fs;
use std::path::{Path, PathBuf};

use super::models::WorkspacePersistenceState;
use crate::error::{AppError, AppResult};

const APP_DIRECTORY: &str = "CodexAppPlus";
const STORE_FILE_NAME: &str = "workspace-roots.json";
const STORE_VERSION: u32 = 1;

pub fn read_workspace_state() -> AppResult<Option<WorkspacePersistenceState>> {
    let path = store_path()?;
    read_store(&path)
}

pub fn write_workspace_state(input: WorkspacePersistenceState) -> AppResult<()> {
    let path = store_path()?;
    write_store(&path, &input)
}

fn read_store(path: &Path) -> AppResult<Option<WorkspacePersistenceState>> {
    if !path.exists() {
        return Ok(None);
    }

    let text = fs::read_to_string(path)?;
    let state = serde_json::from_str::<WorkspacePersistenceState>(&text)?;
    Ok(Some(normalize_state(state)?))
}

fn write_store(path: &Path, state: &WorkspacePersistenceState) -> AppResult<()> {
    let normalized = normalize_state(state.clone())?;
    write_bytes_atomic(path, &serde_json::to_vec_pretty(&normalized)?)
}

fn normalize_state(state: WorkspacePersistenceState) -> AppResult<WorkspacePersistenceState> {
    if state.version != STORE_VERSION {
        return Err(AppError::InvalidInput("不支持的工作区存储版本".to_string()));
    }

    let selected_root_id = match state.selected_root_id {
        Some(root_id) if state.roots.iter().any(|root| root.id == root_id) => Some(root_id),
        _ => state.roots.first().map(|root| root.id.clone()),
    };

    Ok(WorkspacePersistenceState {
        version: state.version,
        roots: state.roots,
        managed_worktrees: state.managed_worktrees,
        selected_root_id,
    })
}

fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::InvalidInput("无效路径".to_string()))?;
    fs::create_dir_all(parent)?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("workspace-state");
    let temp_path = parent.join(format!("{file_name}.tmp"));
    fs::write(&temp_path, bytes)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temp_path, path)?;
    Ok(())
}

fn store_path() -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    Ok(local_data.join(APP_DIRECTORY).join(STORE_FILE_NAME))
}

#[cfg(test)]
mod tests {
    use super::{read_store, write_store};
    use crate::models::{
        ManagedWorktreeState, WorkspaceLaunchScriptState, WorkspacePersistenceState,
        WorkspaceRootState,
    };
    use crate::test_support::unique_temp_dir;

    fn sample_state() -> WorkspacePersistenceState {
        WorkspacePersistenceState {
            version: 1,
            roots: vec![WorkspaceRootState {
                id: "root-1".to_string(),
                name: "Codex".to_string(),
                path: "E:/code/codex-app-plus".to_string(),
                launch_script: Some("pnpm dev".to_string()),
                launch_scripts: Some(vec![WorkspaceLaunchScriptState {
                    id: "web".to_string(),
                    script: "pnpm web".to_string(),
                    icon: "globe".to_string(),
                    label: Some("前端".to_string()),
                }]),
            }],
            managed_worktrees: vec![ManagedWorktreeState {
                path: "E:/code/worktrees/feature-a".to_string(),
                repo_path: "E:/code/codex-app-plus".to_string(),
                branch: Some("feature-a".to_string()),
                created_at: "2026-04-07T00:00:00.000Z".to_string(),
            }],
            selected_root_id: Some("root-1".to_string()),
        }
    }

    #[test]
    fn returns_none_when_file_does_not_exist() {
        let path = unique_temp_dir("codex-app-plus", "workspace-read").join("workspace.json");

        let state = read_store(&path).expect("read state");

        assert_eq!(state, None);
    }

    #[test]
    fn writes_and_reads_workspace_state() {
        let path = unique_temp_dir("codex-app-plus", "workspace-write").join("workspace.json");
        let state = sample_state();

        write_store(&path, &state).expect("write state");
        let restored = read_store(&path).expect("read state");

        assert_eq!(restored, Some(state));
    }

    #[test]
    fn normalizes_missing_selected_root_to_first_root() {
        let path = unique_temp_dir("codex-app-plus", "workspace-normalize").join("workspace.json");
        let mut state = sample_state();
        state.selected_root_id = Some("missing-root".to_string());

        write_store(&path, &state).expect("write state");
        let restored = read_store(&path).expect("read state");

        assert_eq!(
            restored.and_then(|value| value.selected_root_id),
            Some("root-1".to_string())
        );
    }
}
