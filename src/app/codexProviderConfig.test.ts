import { describe, expect, it } from "vitest";
import {
  createAuthJsonText,
  createConfigTomlText,
  createEmptyCodexProviderDraft,
  extractCodexConfigFields,
  readCurrentCodexProviderKey,
  updateAuthJsonWithApiKey,
  updateConfigTomlWithBasics,
  validateCodexProviderDraft,
} from "./codexProviderConfig";

describe("codexProviderConfig", () => {
  it("builds and updates basic auth/config content", () => {
    const authText = createAuthJsonText("secret-1");
    const configText = createConfigTomlText({
      providerKey: "right_code",
      baseUrl: "https://right.codes/codex/v1",
      model: "gpt-5.4",
      providerName: "Right Code",
    });

    expect(updateAuthJsonWithApiKey(JSON.parse(authText) as Record<string, unknown>, "secret-2")).toContain("secret-2");
    expect(extractCodexConfigFields(configText)).toEqual({
      providerKey: "right_code",
      baseUrl: "https://right.codes/codex/v1",
      model: "gpt-5.4",
    });
  });

  it("preserves extra config fields while rewriting basics", () => {
    const nextText = updateConfigTomlWithBasics(
      {
        model_provider: "old_provider",
        model: "gpt-5.3",
        approval_policy: "never",
        model_providers: {
          old_provider: { base_url: "https://old.example", env_key: "OPENAI_API_KEY" },
          keep_provider: { base_url: "https://keep.example" },
        },
      },
      {
        providerKey: "right_code",
        baseUrl: "https://right.codes/codex/v1",
        model: "gpt-5.4",
        providerName: "Right Code",
      }
    );

    expect(nextText).toContain("approval_policy = \"never\"");
    expect(nextText).toContain("keep_provider");
    expect(nextText).toContain("right_code");
  });

  it("reports invalid advanced content and reads current provider", () => {
    const draft = {
      ...createEmptyCodexProviderDraft(),
      name: "Right Code",
      providerKey: "right_code",
      apiKey: "secret-1",
      baseUrl: "https://right.codes/codex/v1",
      model: "gpt-5.4",
      authJsonText: "{bad json}",
      configTomlText: "bad = [toml",
    };

    expect(validateCodexProviderDraft(draft, []).authJsonText).toBeTruthy();
    expect(validateCodexProviderDraft(draft, []).configTomlText).toBeTruthy();
    expect(readCurrentCodexProviderKey({ config: { model_provider: "right_code" } })).toBe("right_code");
  });
});
