use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};

#[derive(Debug, Deserialize, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentEnvironment {
    WindowsNative,
    Wsl,
}

impl Default for AgentEnvironment {
    fn default() -> Self {
        Self::WindowsNative
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppServerStartInput {
    pub agent_environment: Option<AgentEnvironment>,
    pub codex_path: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProxyMode {
    Disabled,
    System,
    Custom,
}

impl Default for ProxyMode {
    fn default() -> Self {
        Self::Disabled
    }
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProxySettings {
    pub mode: ProxyMode,
    pub http_proxy: String,
    pub https_proxy: String,
    pub no_proxy: String,
}

impl<'de> Deserialize<'de> for ProxySettings {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Raw {
            #[serde(default)]
            mode: Option<ProxyMode>,
            #[serde(default)]
            enabled: Option<bool>,
            #[serde(default)]
            http_proxy: String,
            #[serde(default)]
            https_proxy: String,
            #[serde(default)]
            no_proxy: String,
        }

        let raw = Raw::deserialize(deserializer)?;
        let mode = raw.mode.unwrap_or_else(|| match raw.enabled {
            Some(true) => ProxyMode::System,
            _ => ProxyMode::Disabled,
        });
        Ok(ProxySettings {
            mode,
            http_proxy: raw.http_proxy,
            https_proxy: raw.https_proxy,
            no_proxy: raw.no_proxy,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadProxySettingsInput {
    pub agent_environment: AgentEnvironment,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadProxySettingsOutput {
    pub settings: ProxySettings,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLaunchScriptState {
    pub id: String,
    pub script: String,
    pub icon: String,
    pub label: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRootState {
    pub id: String,
    pub name: String,
    pub path: String,
    pub launch_script: Option<String>,
    pub launch_scripts: Option<Vec<WorkspaceLaunchScriptState>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedWorktreeState {
    pub path: String,
    pub repo_path: String,
    pub branch: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePersistenceState {
    pub version: u32,
    pub roots: Vec<WorkspaceRootState>,
    pub managed_worktrees: Vec<ManagedWorktreeState>,
    pub selected_root_id: Option<String>,
}

impl Default for WorkspacePersistenceState {
    fn default() -> Self {
        Self {
            version: 1,
            roots: Vec::new(),
            managed_worktrees: Vec::new(),
            selected_root_id: None,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProxySettingsInput {
    pub agent_environment: AgentEnvironment,
    #[serde(flatten)]
    pub settings: ProxySettings,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProxySettingsOutput {
    pub settings: ProxySettings,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcRequestInput {
    pub method: String,
    pub params: Value,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcNotifyInput {
    pub method: String,
    pub params: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcRequestOutput {
    pub request_id: String,
    pub result: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcCancelInput {
    pub request_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JsonRpcErrorBody {
    pub code: i64,
    pub message: String,
    pub data: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum RequestId {
    String(String),
    Number(Number),
}

impl RequestId {
    pub fn is_empty(&self) -> bool {
        matches!(self, Self::String(value) if value.is_empty())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerRequestResolveInput {
    pub request_id: RequestId,
    pub result: Option<Value>,
    pub error: Option<JsonRpcErrorBody>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ShowNotificationInput {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum WindowChromeAction {
    Minimize,
    ToggleMaximize,
    Close,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ContextMenuItem {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ShowContextMenuInput {
    pub x: i32,
    pub y: i32,
    pub items: Vec<ContextMenuItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevealPathInFolderInput {
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOfficialDataInput {
    pub source_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalAgentInstructionsOutput {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentSummaryOutput {
    pub name: String,
    pub description: Option<String>,
    pub config_file: String,
    pub resolved_path: String,
    pub managed_by_app: bool,
    pub file_exists: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentsSettingsOutput {
    pub config_path: String,
    pub multi_agent_enabled: bool,
    pub max_threads: u32,
    pub max_depth: u32,
    pub agents: Vec<AgentSummaryOutput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAgentsSettingsInput {
    pub agent_environment: Option<AgentEnvironment>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAgentsCoreInput {
    pub agent_environment: Option<AgentEnvironment>,
    pub multi_agent_enabled: bool,
    pub max_threads: u32,
    pub max_depth: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentInput {
    pub agent_environment: Option<AgentEnvironment>,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAgentInput {
    pub agent_environment: Option<AgentEnvironment>,
    pub original_name: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAgentInput {
    pub agent_environment: Option<AgentEnvironment>,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAgentConfigInput {
    pub agent_environment: Option<AgentEnvironment>,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteAgentConfigInput {
    pub agent_environment: Option<AgentEnvironment>,
    pub name: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAgentConfigOutput {
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteAgentConfigOutput {
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodexConfigTomlInput {
    pub agent_environment: AgentEnvironment,
    pub file_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadGlobalAgentInstructionsInput {
    pub agent_environment: AgentEnvironment,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCustomPromptsInput {
    pub agent_environment: AgentEnvironment,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CustomPromptOutput {
    pub name: String,
    pub path: String,
    pub content: String,
    pub description: Option<String>,
    pub argument_hint: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGlobalAgentInstructionsInput {
    pub agent_environment: Option<AgentEnvironment>,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatgptAuthTokensOutput {
    pub access_token: String,
    pub chatgpt_account_id: String,
    pub chatgpt_plan_type: Option<String>,
    pub source: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChatgptAuthTokensInput {
    pub access_token: String,
    pub chatgpt_account_id: String,
    pub chatgpt_plan_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateCodexChatgptInput {
    pub agent_environment: Option<AgentEnvironment>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCodexAuthModeStateInput {
    pub agent_environment: Option<AgentEnvironment>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureCodexOauthSnapshotInput {
    pub agent_environment: Option<AgentEnvironment>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CodexAuthMode {
    Chatgpt,
    Apikey,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAuthModeStateOutput {
    pub active_mode: CodexAuthMode,
    pub active_provider_key: Option<String>,
    pub oauth_snapshot_available: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAuthSwitchResult {
    pub mode: CodexAuthMode,
    pub provider_id: Option<String>,
    pub provider_key: Option<String>,
    pub auth_path: String,
    pub config_path: String,
    pub restored_from_snapshot: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionSummary {
    pub id: String,
    pub title: String,
    pub cwd: String,
    pub updated_at: String,
    pub agent_environment: AgentEnvironment,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCodexSessionsInput {
    pub agent_environment: AgentEnvironment,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCodexSessionsInput {
    pub agent_environment: AgentEnvironment,
    pub query: String,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionReadInput {
    pub thread_id: String,
    pub agent_environment: AgentEnvironment,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCodexSessionInput {
    pub thread_id: String,
    pub agent_environment: AgentEnvironment,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionMessage {
    pub id: String,
    pub role: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionReadOutput {
    pub thread_id: String,
    pub messages: Vec<CodexSessionMessage>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionSearchMatch {
    pub line_text: String,
    pub line_number: usize,
    pub start_column: usize,
    pub end_column: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionSearchResult {
    pub id: String,
    pub title: String,
    pub cwd: String,
    pub updated_at: String,
    pub agent_environment: AgentEnvironment,
    pub matches: Vec<CodexSessionSearchMatch>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceOpener {
    Vscode,
    VisualStudio,
    GithubDesktop,
    Explorer,
    Terminal,
    GitBash,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWorkspaceInput {
    pub path: String,
    pub opener: WorkspaceOpener,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenFileInEditorInput {
    pub path: String,
    pub agent_environment: Option<AgentEnvironment>,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RememberCommandApprovalRuleInput {
    pub agent_environment: AgentEnvironment,
    pub command: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RememberCommandApprovalRuleOutput {
    pub rules_path: String,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum EmbeddedTerminalShell {
    PowerShell,
    CommandPrompt,
    GitBash,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCreateInput {
    pub root_key: String,
    pub terminal_id: String,
    pub cwd: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub shell: Option<EmbeddedTerminalShell>,
    pub enforce_utf8: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCreateOutput {
    pub session_id: String,
    pub shell: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalWriteInput {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalResizeInput {
    pub session_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCloseInput {
    pub session_id: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ConnectionChangedPayload {
    pub status: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct NotificationPayload {
    pub method: String,
    pub params: Value,
}

#[derive(Debug, Serialize, Clone)]
pub struct ServerRequestPayload {
    pub id: RequestId,
    pub method: String,
    pub params: Value,
}

#[derive(Debug, Serialize, Clone)]
pub struct FatalErrorPayload {
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionIndexUpdatedPayload {
    pub agent_environment: AgentEnvironment,
    pub duration_ms: u64,
    pub session_count: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputPayload {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitPayload {
    pub session_id: String,
    pub exit_code: Option<u32>,
}
