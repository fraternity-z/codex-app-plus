use crate::agent_environment::{resolve_agent_environment, resolve_codex_home_relative_path};
use crate::error::{AppError, AppResult};
use crate::models::{RememberCommandApprovalRuleInput, RememberCommandApprovalRuleOutput};
use crate::rules::append_prefix_rule;

const DEFAULT_RULES_PATH: &str = ".codex/rules/default.rules";

pub fn remember_command_approval_rule(
    input: RememberCommandApprovalRuleInput,
) -> AppResult<RememberCommandApprovalRuleOutput> {
    let command = normalize_command_tokens(input.command)?;
    let agent_environment = resolve_agent_environment(Some(input.agent_environment));
    let rules_path = resolve_codex_home_relative_path(agent_environment, DEFAULT_RULES_PATH)?;
    append_prefix_rule(&rules_path.host_path, &command).map_err(AppError::InvalidInput)?;
    Ok(RememberCommandApprovalRuleOutput {
        rules_path: rules_path.display_path,
    })
}

fn normalize_command_tokens(command: Vec<String>) -> AppResult<Vec<String>> {
    let tokens = command
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    if tokens.is_empty() {
        return Err(AppError::InvalidInput("command 不能为空".to_string()));
    }
    Ok(tokens)
}

#[cfg(test)]
mod tests {
    use super::normalize_command_tokens;

    #[test]
    fn normalize_command_tokens_rejects_empty_tokens() {
        let result = normalize_command_tokens(vec![" ".to_string()]);
        assert!(result.is_err());
    }

    #[test]
    fn normalize_command_tokens_trims_values() {
        let result = normalize_command_tokens(vec![
            " Get-ChildItem ".to_string(),
            "".to_string(),
            " src ".to_string(),
        ])
        .unwrap();
        assert_eq!(result, vec!["Get-ChildItem".to_string(), "src".to_string()]);
    }
}
