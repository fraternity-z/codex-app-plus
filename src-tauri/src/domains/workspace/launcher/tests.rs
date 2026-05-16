use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;

use super::*;
use crate::models::AgentEnvironment;
use crate::test_support::unique_temp_dir;

fn test_locations(
    path_directories: Vec<PathBuf>,
    local_app_data: Option<PathBuf>,
) -> VscodeSearchLocations {
    VscodeSearchLocations {
        path_directories,
        path_extensions: vec![OsString::from(".cmd"), OsString::from(".exe")],
        local_app_data,
        program_files: None,
        program_files_x86: None,
    }
}

#[test]
fn builds_cmd_shell_command_for_code_cmd_on_path() {
    let root = unique_temp_dir("codex-app-plus", "vscode-path");
    let path_directory = root.join("bin");
    let workspace_path = root.join("workspace");
    let shell_script_path = path_directory.join("code");
    let script_path = path_directory.join("code.cmd");
    fs::create_dir_all(&path_directory).unwrap();
    fs::create_dir_all(&workspace_path).unwrap();
    fs::write(&shell_script_path, "#!/usr/bin/env sh\n").unwrap();
    fs::write(&script_path, "@echo off\r\n").unwrap();

    let spec = build_vscode_command_for_locations(
        &workspace_path,
        &test_locations(vec![path_directory], None),
    )
    .unwrap();

    assert_eq!(spec.program, OsString::from("cmd.exe"));
    assert_eq!(
        spec.arguments,
        vec![
            OsString::from("/C"),
            script_path.as_os_str().to_os_string(),
            OsString::from("--new-window"),
            workspace_path.as_os_str().to_os_string(),
        ]
    );
    assert!(spec.hide_window);
}

#[test]
fn falls_back_to_common_user_install_location() {
    let root = unique_temp_dir("codex-app-plus", "vscode-install");
    let local_app_data = root.join("local");
    let workspace_path = root.join("workspace");
    let executable_path = local_app_data
        .join("Programs")
        .join("Microsoft VS Code")
        .join("Code.exe");
    fs::create_dir_all(executable_path.parent().unwrap()).unwrap();
    fs::create_dir_all(&workspace_path).unwrap();
    fs::write(&executable_path, []).unwrap();

    let spec = build_vscode_command_for_locations(
        &workspace_path,
        &test_locations(Vec::new(), Some(local_app_data)),
    )
    .unwrap();

    assert_eq!(spec.program, executable_path.as_os_str().to_os_string());
    assert_eq!(
        spec.arguments,
        vec![
            OsString::from("--new-window"),
            workspace_path.as_os_str().to_os_string(),
        ]
    );
    assert!(!spec.hide_window);
}

#[test]
fn returns_explicit_error_when_vscode_cannot_be_found() {
    let root = unique_temp_dir("codex-app-plus", "vscode-missing");
    let workspace_path = root.join("workspace");
    fs::create_dir_all(&workspace_path).unwrap();

    let result =
        build_vscode_command_for_locations(&workspace_path, &test_locations(Vec::new(), None));

    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("未找到 VS Code 可执行文件"));
}

#[test]
fn builds_open_file_command_with_line_and_column_for_script_binary() {
    let binary = PathBuf::from("code.cmd");
    let input = OpenFileInEditorInput {
        path: "E:/code/codex-app-plus/src/App.tsx".to_string(),
        agent_environment: Some(AgentEnvironment::WindowsNative),
        line: Some(42),
        column: Some(7),
    };

    let spec = build_open_file_command_spec_with(&binary, &input, |agent_environment, path| {
        assert_eq!(agent_environment, AgentEnvironment::WindowsNative);
        assert_eq!(path, "E:/code/codex-app-plus/src/App.tsx");
        Ok(PathBuf::from(r"E:\code\codex-app-plus\src\App.tsx"))
    })
    .unwrap();

    assert_eq!(spec.program, OsString::from("cmd.exe"));
    assert_eq!(
        spec.arguments,
        vec![
            OsString::from("/C"),
            OsString::from("code.cmd"),
            OsString::from("--reuse-window"),
            OsString::from("--goto"),
            OsString::from(r"E:\code\codex-app-plus\src\App.tsx:42:7"),
        ]
    );
    assert!(spec.hide_window);
}

#[test]
fn sanitizes_namespace_drive_paths_before_building_goto_argument() {
    let arguments = create_vscode_editor_arguments(
        PathBuf::from(r"\\?\E:\code\codex-app-plus\src\App.tsx").as_path(),
        Some(33),
        Some(5),
    );

    assert_eq!(
        arguments,
        vec![
            OsString::from("--reuse-window"),
            OsString::from("--goto"),
            OsString::from(r"E:\code\codex-app-plus\src\App.tsx:33:5"),
        ]
    );
}

#[test]
fn resolves_wsl_editor_paths_before_building_goto_argument() {
    let binary = PathBuf::from("code.exe");
    let input = OpenFileInEditorInput {
        path: "/mnt/e/code/codex-app-plus/src/App.tsx".to_string(),
        agent_environment: Some(AgentEnvironment::Wsl),
        line: Some(12),
        column: None,
    };

    let spec = build_open_file_command_spec_with(&binary, &input, |agent_environment, path| {
        assert_eq!(agent_environment, AgentEnvironment::Wsl);
        assert_eq!(path, "/mnt/e/code/codex-app-plus/src/App.tsx");
        Ok(PathBuf::from(
            r"\\wsl.localhost\Ubuntu\mnt\e\code\codex-app-plus\src\App.tsx",
        ))
    })
    .unwrap();

    assert_eq!(spec.program, OsString::from("code.exe"));
    assert_eq!(
        spec.arguments,
        vec![
            OsString::from("--reuse-window"),
            OsString::from("--goto"),
            OsString::from(r"\\wsl.localhost\Ubuntu\mnt\e\code\codex-app-plus\src\App.tsx:12",),
        ]
    );
    assert!(!spec.hide_window);
}
