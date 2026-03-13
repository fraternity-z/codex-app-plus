use portable_pty::CommandBuilder;

const DEFAULT_UTF8_LOCALE: &str = "en_US.UTF-8";
const UTF8_ENV_KEYS: [&str; 3] = ["LANG", "LC_ALL", "LC_CTYPE"];

#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
fn build_utf8_environment_assignments(
    enforce_utf8: bool,
    read_env: impl Fn(&str) -> Option<String>,
) -> Vec<(&'static str, String)> {
    if !enforce_utf8 {
        return Vec::new();
    }
    let locale = resolve_utf8_locale(read_env);
    UTF8_ENV_KEYS
        .iter()
        .map(|key| (*key, locale.clone()))
        .collect()
}

#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
fn resolve_utf8_locale(read_env: impl Fn(&str) -> Option<String>) -> String {
    let candidate = read_env("LC_ALL")
        .or_else(|| read_env("LANG"))
        .unwrap_or_else(|| DEFAULT_UTF8_LOCALE.to_string());
    if contains_utf8_token(&candidate) {
        return candidate;
    }
    DEFAULT_UTF8_LOCALE.to_string()
}

#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
fn contains_utf8_token(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("utf-8") || lower.contains("utf8")
}

#[cfg(target_os = "windows")]
pub fn apply_utf8_environment(command: &mut CommandBuilder, enforce_utf8: bool) {
    for (key, value) in build_utf8_environment_assignments(enforce_utf8, |name| {
        std::env::var(name).ok()
    }) {
        command.env(key, value);
    }
}

#[cfg(not(target_os = "windows"))]
pub fn apply_utf8_environment(_command: &mut CommandBuilder, _enforce_utf8: bool) {}

#[cfg(test)]
mod tests {
    use super::{
        build_utf8_environment_assignments, contains_utf8_token, resolve_utf8_locale,
        DEFAULT_UTF8_LOCALE,
    };

    #[test]
    fn detects_utf8_locale_tokens() {
        assert!(contains_utf8_token("en_US.UTF-8"));
        assert!(contains_utf8_token("C.UTF8"));
        assert!(!contains_utf8_token("zh_CN.GBK"));
    }

    #[test]
    fn prefers_existing_utf8_lc_all_locale() {
        let locale = resolve_utf8_locale(|name| match name {
            "LC_ALL" => Some("zh_CN.UTF-8".to_string()),
            _ => None,
        });

        assert_eq!(locale, "zh_CN.UTF-8");
    }

    #[test]
    fn falls_back_to_default_locale_when_environment_is_not_utf8() {
        let locale = resolve_utf8_locale(|name| match name {
            "LC_ALL" => Some("zh_CN.GBK".to_string()),
            "LANG" => Some("zh_CN.GBK".to_string()),
            _ => None,
        });

        assert_eq!(locale, DEFAULT_UTF8_LOCALE);
    }

    #[test]
    fn returns_no_assignments_when_utf8_is_disabled() {
        let assignments = build_utf8_environment_assignments(false, |_| None);

        assert!(assignments.is_empty());
    }

    #[test]
    fn builds_utf8_assignments_for_all_terminal_locale_variables() {
        let assignments = build_utf8_environment_assignments(true, |name| match name {
            "LANG" => Some("en_GB.UTF-8".to_string()),
            _ => None,
        });

        assert_eq!(
            assignments,
            vec![
                ("LANG", "en_GB.UTF-8".to_string()),
                ("LC_ALL", "en_GB.UTF-8".to_string()),
                ("LC_CTYPE", "en_GB.UTF-8".to_string()),
            ]
        );
    }
}
