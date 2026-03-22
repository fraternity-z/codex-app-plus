import { describe, expect, it } from "vitest";
import {
  createAuthJsonText,
  createConfigTomlText,
  createDraftFromRecord,
  createEmptyCodexProviderDraft,
  extractCodexConfigFields,
  readCurrentCodexProviderKey,
  updateAuthJsonWithApiKey,
  updateConfigTomlWithBasics,
  validateCodexProviderDraft,
} from "./codexProviderConfig";

describe("codexProviderConfig", () => {
  it("starts new provider drafts with an empty custom provider key", () => {
    const draft = createEmptyCodexProviderDraft();

    expect(draft.providerKey).toBe("");
    expect(draft.configTomlText).toBe("");
  });

  it("builds provider-only auth/config content", () => {
    const authText = createAuthJsonText("secret-1");
    const configText = createConfigTomlText({
      providerKey: "right_code",
      providerName: "Right Code",
      baseUrl: "https://right.codes/codex/v1",
    });

    expect(updateAuthJsonWithApiKey(JSON.parse(authText) as Record<string, unknown>, "secret-2")).toContain("secret-2");
    expect(extractCodexConfigFields(configText)).toEqual({
      providerKey: "right_code",
      providerName: "Right Code",
      baseUrl: "https://right.codes/codex/v1",
    });
    expect(configText).not.toContain("model =");
    expect(configText).not.toContain("model_reasoning_effort");
    expect(configText).not.toContain("disable_response_storage");
  });

  it("rewrites only the current provider patch and preserves provider extras", () => {
    const nextText = updateConfigTomlWithBasics(
      {
        model_provider: "old_provider",
        model: "gpt-5.3",
        approval_policy: "never",
        model_providers: {
          old_provider: {
            name: "Old Provider",
            base_url: "https://old.example",
            env_key: "OPENAI_API_KEY",
          },
          keep_provider: { base_url: "https://keep.example" },
        },
      },
      {
        providerKey: "right_code",
        providerName: "Right Code",
        baseUrl: "https://right.codes/codex/v1",
      },
    );

    expect(nextText).toContain("model_provider = \"right_code\"");
    expect(nextText).toContain("name = \"Right Code\"");
    expect(nextText).toContain("base_url = \"https://right.codes/codex/v1\"");
    expect(nextText).toContain("env_key = \"OPENAI_API_KEY\"");
    expect(nextText).not.toContain("approval_policy = \"never\"");
    expect(nextText).not.toContain("keep_provider");
    expect(nextText).not.toContain("model = \"gpt-5.3\"");
  });

  it("normalizes legacy record config when opening for edit", () => {
    const draft = createDraftFromRecord({
      id: "provider-1",
      name: "Right Code",
      providerKey: "right_code",
      apiKey: "secret-1",
      baseUrl: "https://right.codes/codex/v1",
      authJsonText: '{\n  "OPENAI_API_KEY": "secret-1"\n}\n',
      configTomlText:
        'model_provider = "right_code"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "xhigh"\n\n[model_providers.right_code]\nbase_url = "https://right.codes/codex/v1"\nwire_api = "responses"\n',
      createdAt: 1,
      updatedAt: 2,
    });

    expect(draft.configTomlText).toContain('model_provider = "right_code"');
    expect(draft.configTomlText).toContain('name = "Right Code"');
    expect(draft.configTomlText).not.toContain('model = "gpt-5.4"');
    expect(draft.configTomlText).not.toContain('model_reasoning_effort = "xhigh"');
  });

  it("reports invalid advanced content and reads current provider", () => {
    const draft = {
      ...createEmptyCodexProviderDraft(),
      name: "Right Code",
      providerKey: "right_code",
      apiKey: "secret-1",
      baseUrl: "https://right.codes/codex/v1",
      authJsonText: "{bad json}",
      configTomlText: "bad = [toml",
    };

    expect(validateCodexProviderDraft(draft, []).authJsonText).toBeTruthy();
    expect(validateCodexProviderDraft(draft, []).configTomlText).toBeTruthy();
    expect(readCurrentCodexProviderKey({ config: { model_provider: "right_code" } })).toBe("right_code");
  });

  it("rejects reserved built-in provider ids", () => {
    const draft = {
      ...createEmptyCodexProviderDraft(),
      name: "Right Code",
      providerKey: "openai",
      apiKey: "secret-1",
      baseUrl: "https://right.codes/codex/v1",
      authJsonText: createAuthJsonText("secret-1"),
      configTomlText: "",
    };

    expect(validateCodexProviderDraft(draft, []).providerKey).toContain("openai-custom");
  });
});
