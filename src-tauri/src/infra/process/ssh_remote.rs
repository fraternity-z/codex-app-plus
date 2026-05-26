use std::fs;
use std::path::PathBuf;
use std::process::Stdio;

use tokio::process::Command;
use tokio::time::{timeout, Duration};

use crate::error::{AppError, AppResult};
use crate::infra::process::codex_cli::SpawnedAppServer;
use crate::infra::process::command::command_failure_detail;
use crate::infra::process::windows_child::configure_child_tree_root_tokio_command;
use crate::models::{SaveSshHostInput, SshHostConfig};

const SSH_CONFIG_RELATIVE_PATH: &str = ".ssh/config";
const SSH_RESOLVE_TIMEOUT: Duration = Duration::from_secs(5);

pub async fn list_ssh_hosts() -> AppResult<Vec<SshHostConfig>> {
    let config_path = ssh_config_path()?;
    if !config_path.is_file() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(&config_path).map_err(|error| {
        AppError::InvalidInput(format!(
            "读取 SSH config 失败 {}: {error}",
            config_path.display()
        ))
    })?;
    let aliases = parse_concrete_ssh_host_aliases(&contents);
    let mut hosts = Vec::with_capacity(aliases.len());
    for alias in aliases {
        hosts.push(resolve_ssh_host(alias).await);
    }
    Ok(hosts)
}

pub async fn save_ssh_host(input: SaveSshHostInput) -> AppResult<SshHostConfig> {
    let normalized = normalize_save_ssh_host_input(input)?;
    let config_path = ssh_config_path()?;
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            AppError::Io(format!(
                "创建 SSH 配置目录失败 {}: {error}",
                parent.display()
            ))
        })?;
    }

    let contents = if config_path.is_file() {
        fs::read_to_string(&config_path).map_err(|error| {
            AppError::InvalidInput(format!(
                "读取 SSH config 失败 {}: {error}",
                config_path.display()
            ))
        })?
    } else {
        String::new()
    };
    let next_contents = upsert_ssh_host_config_contents(&contents, &normalized)?;
    fs::write(&config_path, next_contents).map_err(|error| {
        AppError::Io(format!(
            "写入 SSH config 失败 {}: {error}",
            config_path.display()
        ))
    })?;

    Ok(resolve_ssh_host(normalized.alias).await)
}

pub fn normalize_ssh_host_alias(alias: &str) -> AppResult<String> {
    let trimmed = alias.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("SSH host 不能为空".to_string()));
    }
    if trimmed.starts_with('-') {
        return Err(AppError::InvalidInput("SSH host 不能以 - 开头".to_string()));
    }
    if trimmed.chars().any(char::is_control) || trimmed.chars().any(char::is_whitespace) {
        return Err(AppError::InvalidInput(
            "SSH host 不能包含空白或控制字符".to_string(),
        ));
    }
    if is_pattern_host(trimmed) {
        return Err(AppError::InvalidInput(
            "SSH host 必须是 ~/.ssh/config 中的具体别名，不能是通配模式".to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

pub fn spawn_ssh_app_server(alias: &str) -> AppResult<SpawnedAppServer> {
    let alias = normalize_ssh_host_alias(alias)?;
    let mut command = Command::new("ssh");
    command.args([
        "-T",
        "-o",
        "BatchMode=yes",
        alias.as_str(),
        "codex",
        "app-server",
        "--analytics-default-enabled",
        "--listen",
        "stdio://",
    ]);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_child_tree_root_tokio_command(&mut command);

    let mut child = command.spawn().map_err(|error| {
        AppError::Protocol(format!(
            "通过 SSH 启动远程 Codex app-server 失败 ({alias}): {error}"
        ))
    })?;
    let stdin = child.stdin.take().ok_or_else(|| {
        AppError::Protocol("failed to acquire remote app-server stdin".to_string())
    })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        AppError::Protocol("failed to acquire remote app-server stdout".to_string())
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        AppError::Protocol("failed to acquire remote app-server stderr".to_string())
    })?;

    Ok(SpawnedAppServer {
        child,
        stdin,
        stdout,
        stderr,
    })
}

fn parse_concrete_ssh_host_aliases(contents: &str) -> Vec<String> {
    let mut aliases = Vec::new();
    for line in contents.lines() {
        let Some((keyword, rest)) = split_ssh_config_keyword(line) else {
            continue;
        };
        if !keyword.eq_ignore_ascii_case("host") {
            continue;
        }
        for token in rest.split_whitespace() {
            if is_pattern_host(token) || aliases.iter().any(|alias| alias == token) {
                continue;
            }
            aliases.push(token.to_string());
        }
    }
    aliases
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NormalizedSshHostInput {
    alias: String,
    host_name: String,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
}

fn ssh_config_path() -> AppResult<PathBuf> {
    Ok(dirs::home_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析用户目录".to_string()))?
        .join(SSH_CONFIG_RELATIVE_PATH))
}

fn normalize_save_ssh_host_input(input: SaveSshHostInput) -> AppResult<NormalizedSshHostInput> {
    let alias = normalize_saved_ssh_host_alias(&input.alias)?;
    let (user, host_name) = normalize_ssh_host_target(&input.host_name)?;
    if input.port == Some(0) {
        return Err(AppError::InvalidInput("SSH 端口必须大于 0".to_string()));
    }
    let identity_file = input
        .identity_file
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(normalize_identity_file_path)
        .transpose()?;

    Ok(NormalizedSshHostInput {
        alias,
        host_name,
        user,
        port: input.port,
        identity_file,
    })
}

fn normalize_saved_ssh_host_alias(alias: &str) -> AppResult<String> {
    let alias = normalize_ssh_host_alias(alias)?;
    if !alias
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
    {
        return Err(AppError::InvalidInput(
            "SSH 显示名称只能包含字母、数字、点、下划线或短横线".to_string(),
        ));
    }
    Ok(alias)
}

fn normalize_ssh_host_target(target: &str) -> AppResult<(Option<String>, String)> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("SSH 主机名不能为空".to_string()));
    }
    if trimmed.starts_with('-') {
        return Err(AppError::InvalidInput(
            "SSH 主机名不能以 - 开头".to_string(),
        ));
    }
    if trimmed.chars().any(char::is_control) || trimmed.chars().any(char::is_whitespace) {
        return Err(AppError::InvalidInput(
            "SSH 主机名不能包含空白或控制字符".to_string(),
        ));
    }

    let (user, host_name) = if let Some((user, host_name)) = trimmed.rsplit_once('@') {
        let user = normalize_ssh_config_token(user, "SSH 用户名")?;
        let host_name = normalize_ssh_config_token(host_name, "SSH 主机名")?;
        (Some(user), host_name)
    } else {
        (None, normalize_ssh_config_token(trimmed, "SSH 主机名")?)
    };

    if host_name.starts_with('-') {
        return Err(AppError::InvalidInput(
            "SSH 主机名不能以 - 开头".to_string(),
        ));
    }

    Ok((user, host_name))
}

fn normalize_ssh_config_token(value: &str, label: &str) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput(format!("{label}不能为空")));
    }
    if trimmed.chars().any(char::is_control) || trimmed.chars().any(char::is_whitespace) {
        return Err(AppError::InvalidInput(format!(
            "{label}不能包含空白或控制字符"
        )));
    }
    Ok(trimmed.to_string())
}

fn normalize_identity_file_path(value: &str) -> AppResult<String> {
    if value.chars().any(char::is_control) {
        return Err(AppError::InvalidInput(
            "身份文件路径不能包含控制字符".to_string(),
        ));
    }
    Ok(value.replace('\\', "/"))
}

fn upsert_ssh_host_config_contents(
    contents: &str,
    host: &NormalizedSshHostInput,
) -> AppResult<String> {
    let lines: Vec<&str> = contents.lines().collect();
    let mut matching_block: Option<(usize, usize)> = None;
    for (index, line) in lines.iter().enumerate() {
        let Some((keyword, rest)) = split_ssh_config_keyword(line) else {
            continue;
        };
        if !keyword.eq_ignore_ascii_case("host") {
            continue;
        }
        let tokens: Vec<&str> = rest.split_whitespace().collect();
        if !tokens.iter().any(|token| *token == host.alias) {
            continue;
        }
        if tokens.len() != 1 {
            return Err(AppError::InvalidInput(format!(
                "SSH host {} 已存在于多别名 Host 配置块中，请换一个显示名称",
                host.alias
            )));
        }
        let end = find_ssh_host_block_end(&lines, index + 1);
        matching_block = Some((index, end));
        break;
    }

    let block = build_ssh_host_config_block(host);
    if let Some((start, end)) = matching_block {
        let mut next = String::new();
        for line in &lines[..start] {
            next.push_str(line);
            next.push('\n');
        }
        next.push_str(&block);
        for line in &lines[end..] {
            next.push_str(line);
            next.push('\n');
        }
        return Ok(next);
    }

    let mut next = contents.to_string();
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    if !next.is_empty() && !next.ends_with("\n\n") {
        next.push('\n');
    }
    next.push_str(&block);
    Ok(next)
}

fn find_ssh_host_block_end(lines: &[&str], start: usize) -> usize {
    for (offset, line) in lines[start..].iter().enumerate() {
        let Some((keyword, _)) = split_ssh_config_keyword(line) else {
            continue;
        };
        if keyword.eq_ignore_ascii_case("host") || keyword.eq_ignore_ascii_case("match") {
            return start + offset;
        }
    }
    lines.len()
}

fn build_ssh_host_config_block(host: &NormalizedSshHostInput) -> String {
    let mut lines = vec![
        format!("Host {}", host.alias),
        format!("  HostName {}", ssh_config_value(&host.host_name)),
    ];
    if let Some(user) = &host.user {
        lines.push(format!("  User {}", ssh_config_value(user)));
    }
    if let Some(port) = host.port {
        lines.push(format!("  Port {port}"));
    }
    if let Some(identity_file) = &host.identity_file {
        lines.push(format!(
            "  IdentityFile {}",
            ssh_config_value(identity_file)
        ));
        lines.push("  IdentitiesOnly yes".to_string());
    }
    lines.push(String::new());
    lines.join("\n")
}

fn ssh_config_value(value: &str) -> String {
    if value
        .chars()
        .any(|ch| ch.is_whitespace() || matches!(ch, '#' | '"'))
    {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        value.to_string()
    }
}

fn split_ssh_config_keyword(line: &str) -> Option<(&str, &str)> {
    let without_comment = line.split('#').next().unwrap_or_default().trim();
    if without_comment.is_empty() {
        return None;
    }
    let mut parts = without_comment.splitn(2, char::is_whitespace);
    let keyword = parts.next()?.trim();
    let rest = parts.next()?.trim();
    if keyword.is_empty() || rest.is_empty() {
        return None;
    }
    Some((keyword, rest))
}

fn is_pattern_host(value: &str) -> bool {
    value.contains('*')
        || value.contains('?')
        || value.contains('[')
        || value.contains(']')
        || value.starts_with('!')
}

async fn resolve_ssh_host(alias: String) -> SshHostConfig {
    match resolve_ssh_host_inner(&alias).await {
        Ok(mut config) => {
            config.alias = alias;
            config
        }
        Err(error) => SshHostConfig {
            alias,
            host_name: None,
            user: None,
            port: None,
            resolved: false,
            resolve_error: Some(error.to_string()),
        },
    }
}

async fn resolve_ssh_host_inner(alias: &str) -> AppResult<SshHostConfig> {
    let alias = normalize_ssh_host_alias(alias)?;
    let mut command = Command::new("ssh");
    command.args(["-G", alias.as_str()]);
    configure_child_tree_root_tokio_command(&mut command);
    let output = timeout(SSH_RESOLVE_TIMEOUT, command.output())
        .await
        .map_err(|_| AppError::Timeout(format!("解析 SSH host {alias} 超时")))??;

    if !output.status.success() {
        return Err(AppError::Protocol(format!(
            "ssh -G {alias} 失败: {}",
            command_failure_detail(&output.stderr, &output.stdout, output.status.to_string())
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut host_name = None;
    let mut user = None;
    let mut port = None;
    for line in stdout.lines() {
        let mut parts = line.splitn(2, char::is_whitespace);
        let key = parts.next().unwrap_or_default();
        let value = parts.next().unwrap_or_default().trim();
        if value.is_empty() {
            continue;
        }
        match key {
            "hostname" => host_name = Some(value.to_string()),
            "user" => user = Some(value.to_string()),
            "port" => port = value.parse::<u16>().ok(),
            _ => {}
        }
    }

    Ok(SshHostConfig {
        alias,
        host_name,
        user,
        port,
        resolved: true,
        resolve_error: None,
    })
}

#[cfg(test)]
mod tests {
    use crate::models::SaveSshHostInput;

    use super::{
        build_ssh_host_config_block, normalize_save_ssh_host_input, normalize_ssh_host_alias,
        parse_concrete_ssh_host_aliases, upsert_ssh_host_config_contents,
    };

    #[test]
    fn parses_only_concrete_host_aliases() {
        let contents = r#"
            # comment
            Host devbox staging.example.com *.example.com !blocked
              HostName devbox.example.com
            Host github-?
              User git
            Host work
            Host devbox
            Match host *
              User nobody
        "#;

        assert_eq!(
            parse_concrete_ssh_host_aliases(contents),
            vec![
                "devbox".to_string(),
                "staging.example.com".to_string(),
                "work".to_string(),
            ],
        );
    }

    #[test]
    fn rejects_option_like_or_pattern_aliases() {
        assert!(normalize_ssh_host_alias("-oProxyCommand=bad").is_err());
        assert!(normalize_ssh_host_alias("dev box").is_err());
        assert!(normalize_ssh_host_alias("*.example.com").is_err());
        assert_eq!(normalize_ssh_host_alias(" devbox ").unwrap(), "devbox");
    }

    #[test]
    fn builds_config_block_from_user_host_and_identity_file() {
        let normalized = normalize_save_ssh_host_input(SaveSshHostInput {
            alias: "devbox".to_string(),
            host_name: "you@devbox.example.com".to_string(),
            port: Some(2222),
            identity_file: Some("C:\\Users\\You\\.ssh\\work key".to_string()),
        })
        .unwrap();

        assert_eq!(
            build_ssh_host_config_block(&normalized),
            concat!(
                "Host devbox\n",
                "  HostName devbox.example.com\n",
                "  User you\n",
                "  Port 2222\n",
                "  IdentityFile \"C:/Users/You/.ssh/work key\"\n",
                "  IdentitiesOnly yes\n"
            )
        );
    }

    #[test]
    fn appends_or_replaces_single_alias_host_blocks() {
        let normalized = normalize_save_ssh_host_input(SaveSshHostInput {
            alias: "devbox".to_string(),
            host_name: "devbox.example.com".to_string(),
            port: None,
            identity_file: None,
        })
        .unwrap();

        assert_eq!(
            upsert_ssh_host_config_contents("Host github.com\n  User git\n", &normalized).unwrap(),
            concat!(
                "Host github.com\n",
                "  User git\n",
                "\n",
                "Host devbox\n",
                "  HostName devbox.example.com\n",
            )
        );

        assert_eq!(
            upsert_ssh_host_config_contents(
                "Host devbox\n  HostName old.example.com\n  User old\nHost prod\n  HostName prod.example.com\n",
                &normalized,
            )
            .unwrap(),
            concat!(
                "Host devbox\n",
                "  HostName devbox.example.com\n",
                "Host prod\n",
                "  HostName prod.example.com\n",
            )
        );
    }

    #[test]
    fn refuses_to_replace_multi_alias_blocks() {
        let normalized = normalize_save_ssh_host_input(SaveSshHostInput {
            alias: "devbox".to_string(),
            host_name: "devbox.example.com".to_string(),
            port: None,
            identity_file: None,
        })
        .unwrap();

        assert!(
            upsert_ssh_host_config_contents("Host devbox staging\n  User you\n", &normalized)
                .is_err()
        );
    }
}
