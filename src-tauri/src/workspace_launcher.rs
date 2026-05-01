use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::agent_environment::{resolve_agent_environment, resolve_host_path_for_agent_path};
use crate::command_utils::{
    open_detached_target, spawn_background_command, spawn_hidden_background_command,
};
use crate::error::{AppError, AppResult};
use crate::models::{AgentEnvironment, OpenFileInEditorInput, OpenWorkspaceInput, WorkspaceOpener};
use crate::windows_child_process::configure_visible_console_std_command;

const CMD_EXECUTABLE: &str = "cmd.exe";
const CMD_RUN_ARG: &str = "/C";
const VSCODE_NEW_WINDOW_FLAG: &str = "--new-window";
const VSCODE_REUSE_WINDOW_FLAG: &str = "--reuse-window";
const VSCODE_GOTO_FLAG: &str = "--goto";
const DEFAULT_PATH_EXTENSIONS: [&str; 4] = [".COM", ".EXE", ".BAT", ".CMD"];
const VSCODE_COMMAND_NAMES: [&str; 2] = ["code", "code-insiders"];
const USER_INSTALL_RELATIVE_PATHS: [&str; 2] = [
    "Programs\\Microsoft VS Code\\Code.exe",
    "Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe",
];
const MACHINE_INSTALL_RELATIVE_PATHS: [&str; 2] = [
    "Microsoft VS Code\\Code.exe",
    "Microsoft VS Code Insiders\\Code - Insiders.exe",
];

#[derive(Debug, Clone, PartialEq, Eq)]
struct CommandSpec {
    program: OsString,
    arguments: Vec<OsString>,
    hide_window: bool,
}

#[derive(Debug, Clone)]
struct VscodeSearchLocations {
    path_directories: Vec<PathBuf>,
    path_extensions: Vec<OsString>,
    local_app_data: Option<PathBuf>,
    program_files: Option<PathBuf>,
    program_files_x86: Option<PathBuf>,
}

pub fn open_workspace(input: OpenWorkspaceInput) -> AppResult<()> {
    if input.path.trim().is_empty() {
        return Err(AppError::InvalidInput("path 不能为空".to_string()));
    }

    let path = PathBuf::from(&input.path);
    if !path.exists() {
        return Err(AppError::InvalidInput(format!(
            "path 不存在: {}",
            path.display()
        )));
    }

    match input.opener {
        WorkspaceOpener::Vscode => open_vscode_workspace(&path),
        WorkspaceOpener::Explorer => open_detached_target(path),
        WorkspaceOpener::Terminal => {
            spawn_visible_console_program("cmd.exe", ["/K", "cd", "/d", input.path.as_str()])
        }
        WorkspaceOpener::VisualStudio => spawn_program("devenv.exe", [input.path.as_str()]),
        WorkspaceOpener::GithubDesktop => {
            let uri = format!(
                "github-desktop://openRepo/{}",
                input.path.replace('\\', "/")
            );
            open_detached_target(uri)
        }
        WorkspaceOpener::GitBash => spawn_program(
            "C:\\Program Files\\Git\\git-bash.exe",
            [format!("--cd={}", input.path)],
        ),
    }
}

fn open_vscode_workspace(workspace_path: &Path) -> AppResult<()> {
    let spec = build_vscode_command(workspace_path)?;
    spawn_command(spec)
}

fn build_vscode_command(workspace_path: &Path) -> AppResult<CommandSpec> {
    let locations = load_vscode_search_locations();
    build_vscode_command_for_locations(workspace_path, &locations)
}

fn build_vscode_command_for_locations(
    workspace_path: &Path,
    locations: &VscodeSearchLocations,
) -> AppResult<CommandSpec> {
    let binary = resolve_vscode_binary(locations).ok_or_else(|| {
        AppError::InvalidInput(
            "未找到 VS Code 可执行文件，请确认已安装 VS Code 或将 code 命令加入 PATH。".to_string(),
        )
    })?;

    Ok(create_vscode_command_spec(&binary, workspace_path))
}

fn load_vscode_search_locations() -> VscodeSearchLocations {
    VscodeSearchLocations {
        path_directories: std::env::var_os("PATH")
            .map(|value| std::env::split_paths(&value).collect())
            .unwrap_or_default(),
        path_extensions: collect_path_extensions(std::env::var_os("PATHEXT")),
        local_app_data: std::env::var_os("LOCALAPPDATA").map(PathBuf::from),
        program_files: std::env::var_os("ProgramFiles").map(PathBuf::from),
        program_files_x86: std::env::var_os("ProgramFiles(x86)").map(PathBuf::from),
    }
}

fn collect_path_extensions(value: Option<OsString>) -> Vec<OsString> {
    let Some(raw_value) = value else {
        return DEFAULT_PATH_EXTENSIONS.iter().map(OsString::from).collect();
    };

    let text = raw_value.to_string_lossy();
    let extensions = text
        .split(';')
        .filter(|item| !item.is_empty())
        .map(OsString::from)
        .collect::<Vec<_>>();
    if extensions.is_empty() {
        return DEFAULT_PATH_EXTENSIONS.iter().map(OsString::from).collect();
    }
    extensions
}

fn resolve_vscode_binary(locations: &VscodeSearchLocations) -> Option<PathBuf> {
    resolve_vscode_binary_from_path(locations)
        .or_else(|| resolve_vscode_binary_from_installs(locations))
}

fn resolve_vscode_binary_from_path(locations: &VscodeSearchLocations) -> Option<PathBuf> {
    for directory in &locations.path_directories {
        for command_name in VSCODE_COMMAND_NAMES {
            let Some(binary) =
                resolve_binary_in_directory(directory, command_name, &locations.path_extensions)
            else {
                continue;
            };
            return Some(binary);
        }
    }
    None
}

fn resolve_binary_in_directory(
    directory: &Path,
    command_name: &str,
    extensions: &[OsString],
) -> Option<PathBuf> {
    for extension in extensions {
        let candidate = directory.join(format!("{command_name}{}", extension.to_string_lossy()));
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    let plain_candidate = directory.join(command_name);
    if plain_candidate.is_file() {
        return Some(plain_candidate);
    }

    None
}

fn resolve_vscode_binary_from_installs(locations: &VscodeSearchLocations) -> Option<PathBuf> {
    collect_install_candidates(locations)
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn collect_install_candidates(locations: &VscodeSearchLocations) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    append_relative_candidates(
        &mut candidates,
        locations.local_app_data.as_deref(),
        &USER_INSTALL_RELATIVE_PATHS,
    );
    append_relative_candidates(
        &mut candidates,
        locations.program_files.as_deref(),
        &MACHINE_INSTALL_RELATIVE_PATHS,
    );
    append_relative_candidates(
        &mut candidates,
        locations.program_files_x86.as_deref(),
        &MACHINE_INSTALL_RELATIVE_PATHS,
    );
    candidates
}

fn append_relative_candidates(
    candidates: &mut Vec<PathBuf>,
    root: Option<&Path>,
    relative_paths: &[&str],
) {
    let Some(root_path) = root else {
        return;
    };

    for relative_path in relative_paths {
        candidates.push(root_path.join(relative_path));
    }
}

fn create_vscode_command_spec(binary: &Path, workspace_path: &Path) -> CommandSpec {
    let workspace_arg = workspace_path.as_os_str().to_os_string();
    if is_script_binary(binary) {
        return CommandSpec {
            program: OsString::from(CMD_EXECUTABLE),
            arguments: vec![
                OsString::from(CMD_RUN_ARG),
                binary.as_os_str().to_os_string(),
                OsString::from(VSCODE_NEW_WINDOW_FLAG),
                workspace_arg,
            ],
            hide_window: true,
        };
    }

    CommandSpec {
        program: binary.as_os_str().to_os_string(),
        arguments: vec![OsString::from(VSCODE_NEW_WINDOW_FLAG), workspace_arg],
        hide_window: false,
    }
}

fn is_script_binary(path: &Path) -> bool {
    let Some(extension) = path.extension().and_then(OsStr::to_str) else {
        return false;
    };
    extension.eq_ignore_ascii_case("bat") || extension.eq_ignore_ascii_case("cmd")
}

fn spawn_command(spec: CommandSpec) -> AppResult<()> {
    let mut command = Command::new(&spec.program);
    command.args(&spec.arguments);
    if spec.hide_window {
        return spawn_hidden_background_command(&mut command);
    }
    spawn_background_command(&mut command)
}

fn normalize_open_location(line: Option<u32>, column: Option<u32>) -> Option<(u32, Option<u32>)> {
    let line = line.filter(|value| *value > 0)?;
    let column = column.filter(|value| *value > 0);
    Some((line, column))
}

fn format_path_with_location(path: &str, line: u32, column: Option<u32>) -> String {
    match column {
        Some(column) => format!("{path}:{line}:{column}"),
        None => format!("{path}:{line}"),
    }
}

fn normalize_windows_namespace_path(path: &str) -> String {
    if path.is_empty() {
        return String::new();
    }

    fn strip_prefix_ascii_case<'a>(value: &'a str, prefix: &str) -> Option<&'a str> {
        value
            .get(..prefix.len())
            .filter(|candidate| candidate.eq_ignore_ascii_case(prefix))
            .map(|_| &value[prefix.len()..])
    }

    fn starts_with_drive_path(value: &str) -> bool {
        let bytes = value.as_bytes();
        bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && (bytes[2] == b'\\' || bytes[2] == b'/')
    }

    if let Some(rest) = strip_prefix_ascii_case(path, r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    if let Some(rest) = strip_prefix_ascii_case(path, "//?/UNC/") {
        return format!("//{rest}");
    }
    if let Some(rest) = strip_prefix_ascii_case(path, r"\\?\").filter(|rest| starts_with_drive_path(rest)) {
        return rest.to_string();
    }
    if let Some(rest) = strip_prefix_ascii_case(path, "//?/").filter(|rest| starts_with_drive_path(rest)) {
        return rest.to_string();
    }
    if let Some(rest) = strip_prefix_ascii_case(path, r"\\.\").filter(|rest| starts_with_drive_path(rest)) {
        return rest.to_string();
    }
    if let Some(rest) = strip_prefix_ascii_case(path, "//./").filter(|rest| starts_with_drive_path(rest)) {
        return rest.to_string();
    }

    path.to_string()
}

fn create_vscode_editor_arguments(
    editor_path: &Path,
    line: Option<u32>,
    column: Option<u32>,
) -> Vec<OsString> {
    let mut arguments = vec![OsString::from(VSCODE_REUSE_WINDOW_FLAG)];
    if let Some((line, column)) = normalize_open_location(line, column) {
        let sanitized_path = normalize_windows_namespace_path(&editor_path.display().to_string());
        let goto_target = format_path_with_location(&sanitized_path, line, column);
        arguments.push(OsString::from(VSCODE_GOTO_FLAG));
        arguments.push(OsString::from(goto_target));
        return arguments;
    }

    arguments.push(editor_path.as_os_str().to_os_string());
    arguments
}

fn build_open_file_command_spec_with<F>(
    binary: &Path,
    input: &OpenFileInEditorInput,
    resolve_host_path: F,
) -> AppResult<CommandSpec>
where
    F: FnOnce(AgentEnvironment, &str) -> AppResult<PathBuf>,
{
    let agent_environment = resolve_agent_environment(input.agent_environment);
    let editor_path = resolve_host_path(agent_environment, &input.path)?;
    let arguments = create_vscode_editor_arguments(&editor_path, input.line, input.column);

    if is_script_binary(binary) {
        return Ok(CommandSpec {
            program: OsString::from(CMD_EXECUTABLE),
            arguments: {
                let mut args = vec![
                    OsString::from(CMD_RUN_ARG),
                    binary.as_os_str().to_os_string(),
                ];
                args.extend(arguments);
                args
            },
            hide_window: true,
        });
    }

    Ok(CommandSpec {
        program: binary.as_os_str().to_os_string(),
        arguments,
        hide_window: false,
    })
}

pub fn open_file_in_editor(input: OpenFileInEditorInput) -> AppResult<()> {
    if input.path.trim().is_empty() {
        return Err(AppError::InvalidInput("path 不能为空".to_string()));
    }

    let locations = load_vscode_search_locations();
    let binary = resolve_vscode_binary(&locations).ok_or_else(|| {
        AppError::InvalidInput(
            "未找到 VS Code 可执行文件，请确认已安装 VS Code 或将 code 命令加入 PATH。"
                .to_string(),
        )
    })?;
    let spec = build_open_file_command_spec_with(&binary, &input, resolve_host_path_for_agent_path)?;

    spawn_command(spec)
}

fn spawn_program<I, S>(program: &str, arguments: I) -> AppResult<()>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new(program);
    command.args(arguments);
    spawn_background_command(&mut command)
}

fn spawn_visible_console_program<I, S>(program: &str, arguments: I) -> AppResult<()>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new(program);
    command.args(arguments);
    configure_visible_console_std_command(&mut command);
    spawn_background_command(&mut command)
}

#[cfg(test)]
mod tests;
