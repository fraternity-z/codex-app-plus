import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLIENT_REQUEST_METHODS,
  SERVER_NOTIFICATION_METHODS,
  SERVER_REQUEST_METHODS
} from "../methods";

function expectUnique(items: ReadonlyArray<string>): void {
  const set = new Set(items);
  expect(set.size).toBe(items.length);
}

function extractGeneratedMethods(relativePath: string): ReadonlyArray<string> {
  const text = readFileSync(resolve(process.cwd(), relativePath), "utf8");
  return Array.from(text.matchAll(/"method": "([^"]+)"/g), ([, method]) => method);
}

describe("protocol method coverage", () => {
  it("matches generated client request methods", () => {
    expect(CLIENT_REQUEST_METHODS).toEqual(extractGeneratedMethods("src/protocol/generated/ClientRequest.ts"));
    expectUnique(CLIENT_REQUEST_METHODS);
  });

  it("matches generated server notifications", () => {
    expect(SERVER_NOTIFICATION_METHODS).toEqual(extractGeneratedMethods("src/protocol/generated/ServerNotification.ts"));
    expectUnique(SERVER_NOTIFICATION_METHODS);
  });

  it("matches generated server request methods", () => {
    expect(SERVER_REQUEST_METHODS).toEqual(extractGeneratedMethods("src/protocol/generated/ServerRequest.ts"));
    expectUnique(SERVER_REQUEST_METHODS);
  });
});
