import { describe, expect, it } from "vitest";
import { createShellBody } from "./assistantTranscriptDetailModel";

describe("createShellBody", () => {
  it("strips reconnect progress lines from command output", () => {
    expect(createShellBody("rg foo", "命令失败\nReconnecting... 1/5\n\nReconnecting... 2/5")).toBe("$ rg foo\n\n命令失败");
  });

  it("keeps the command line when output only contains reconnect progress", () => {
    expect(createShellBody("rg foo", "Reconnecting... 1/5\nReconnecting... 2/5")).toBe("$ rg foo");
  });
});
