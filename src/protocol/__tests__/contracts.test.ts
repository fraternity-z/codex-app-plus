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

describe("protocol method coverage", () => {
  it("contains all 47 client request methods", () => {
    expect(CLIENT_REQUEST_METHODS.length).toBe(47);
    expectUnique(CLIENT_REQUEST_METHODS);
  });

  it("contains all 44 server notifications", () => {
    expect(SERVER_NOTIFICATION_METHODS.length).toBe(44);
    expectUnique(SERVER_NOTIFICATION_METHODS);
  });

  it("contains all 7 server request methods", () => {
    expect(SERVER_REQUEST_METHODS.length).toBe(7);
    expectUnique(SERVER_REQUEST_METHODS);
  });
});
