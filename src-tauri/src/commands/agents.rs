use crate::domains::agents::models::{
    AgentsSettingsOutput, CreateAgentInput, CustomPetsOutput, CustomPromptOutput, DeleteAgentInput,
    DeleteManagedPromptInput, GetAgentsSettingsInput, GlobalAgentInstructionsOutput,
    ListCustomPetsInput, ListCustomPromptsInput, ListManagedPromptsInput, ManagedPromptOutput,
    ReadAgentConfigInput, ReadAgentConfigOutput, ReadGlobalAgentInstructionsInput,
    SetAgentsCoreInput, SetUserModelInstructionsFileInput, UpdateAgentInput,
    UpdateGlobalAgentInstructionsInput, UpsertManagedPromptInput, WriteAgentConfigInput,
    WriteAgentConfigOutput,
};
use crate::domains::agents::pets::list_custom_pets;
use crate::domains::agents::prompts::{
    delete_managed_prompt, list_custom_prompts, list_managed_prompts,
    set_user_model_instructions_file, upsert_managed_prompt,
};
use crate::domains::agents::service::{
    create_agent, delete_agent, get_agents_settings, read_agent_config, set_agents_core,
    update_agent, write_agent_config,
};
use crate::domains::app::service::{
    read_global_agent_instructions, write_global_agent_instructions,
};

use super::run_blocking;

#[tauri::command]
pub async fn app_get_agents_settings(
    input: GetAgentsSettingsInput,
) -> Result<AgentsSettingsOutput, String> {
    run_blocking(move || get_agents_settings(input)).await
}

#[tauri::command]
pub async fn app_set_agents_core(
    input: SetAgentsCoreInput,
) -> Result<AgentsSettingsOutput, String> {
    run_blocking(move || set_agents_core(input)).await
}

#[tauri::command]
pub async fn app_create_agent(input: CreateAgentInput) -> Result<AgentsSettingsOutput, String> {
    run_blocking(move || create_agent(input)).await
}

#[tauri::command]
pub async fn app_update_agent(input: UpdateAgentInput) -> Result<AgentsSettingsOutput, String> {
    run_blocking(move || update_agent(input)).await
}

#[tauri::command]
pub async fn app_delete_agent(input: DeleteAgentInput) -> Result<AgentsSettingsOutput, String> {
    run_blocking(move || delete_agent(input)).await
}

#[tauri::command]
pub async fn app_read_agent_config(
    input: ReadAgentConfigInput,
) -> Result<ReadAgentConfigOutput, String> {
    run_blocking(move || read_agent_config(input)).await
}

#[tauri::command]
pub async fn app_write_agent_config(
    input: WriteAgentConfigInput,
) -> Result<WriteAgentConfigOutput, String> {
    run_blocking(move || write_agent_config(input)).await
}

#[tauri::command]
pub async fn app_read_global_agent_instructions(
    input: ReadGlobalAgentInstructionsInput,
) -> Result<GlobalAgentInstructionsOutput, String> {
    run_blocking(move || read_global_agent_instructions(input)).await
}

#[tauri::command]
pub async fn app_list_custom_prompts(
    input: ListCustomPromptsInput,
) -> Result<Vec<CustomPromptOutput>, String> {
    run_blocking(move || list_custom_prompts(input)).await
}

#[tauri::command]
pub async fn app_list_custom_pets(input: ListCustomPetsInput) -> Result<CustomPetsOutput, String> {
    run_blocking(move || list_custom_pets(input)).await
}

#[tauri::command]
pub async fn app_list_managed_prompts(
    input: ListManagedPromptsInput,
) -> Result<Vec<ManagedPromptOutput>, String> {
    run_blocking(move || list_managed_prompts(input)).await
}

#[tauri::command]
pub async fn app_upsert_managed_prompt(
    input: UpsertManagedPromptInput,
) -> Result<ManagedPromptOutput, String> {
    run_blocking(move || upsert_managed_prompt(input)).await
}

#[tauri::command]
pub async fn app_delete_managed_prompt(input: DeleteManagedPromptInput) -> Result<(), String> {
    run_blocking(move || delete_managed_prompt(input)).await
}

#[tauri::command]
pub async fn app_set_user_model_instructions_file(
    input: SetUserModelInstructionsFileInput,
) -> Result<(), String> {
    run_blocking(move || set_user_model_instructions_file(input)).await
}

#[tauri::command]
pub async fn app_write_global_agent_instructions(
    input: UpdateGlobalAgentInstructionsInput,
) -> Result<GlobalAgentInstructionsOutput, String> {
    run_blocking(move || write_global_agent_instructions(input)).await
}
