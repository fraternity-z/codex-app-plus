import { describe, expect, it } from "vitest";
import {
  parseConnectionStatus,
  parseNotificationEnvelope,
  parseServerRequestEnvelope
} from "../guards";

describe("protocol guards", () => {
  it("parses connection status", () => {
    expect(parseConnectionStatus("connected")).toBe("connected");
  });

  it("throws on unknown connection status", () => {
    expect(() => parseConnectionStatus("x")).toThrowError();
  });

  it("parses notification envelope", () => {
    const result = parseNotificationEnvelope({ method: "turn/started", params: { ok: true } });
    expect(result.method).toBe("turn/started");
  });

  it("parses server request envelope", () => {
    const result = parseServerRequestEnvelope({
      id: "1",
      method: "item/tool/requestUserInput",
      params: {}
    });
    expect(result.id).toBe("1");
  });
});
