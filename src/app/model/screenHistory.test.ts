import { describe, expect, it } from "vitest";
import type { AppScreen } from "../ui/AppScreenContent";
import {
  canGoBackScreen,
  canGoForwardScreen,
  createScreenHistoryState,
  goBackScreen,
  goForwardScreen,
  pushScreenHistory,
} from "./screenHistory";

describe("screenHistory", () => {
  it("pushes a new screen onto the back stack", () => {
    const state = pushScreenHistory(createScreenHistoryState("home"), "skills");

    expect(state).toEqual({
      current: "skills",
      backStack: ["home"],
      forwardStack: [],
    });
  });

  it("ignores consecutive duplicate screens", () => {
    const initial = createScreenHistoryState("home");

    expect(pushScreenHistory(initial, "home")).toBe(initial);
  });

  it("goes back and forward between screens", () => {
    const advanced = pushScreenHistory(
      pushScreenHistory(createScreenHistoryState("home"), "skills"),
      "general",
    );

    const backed = goBackScreen(advanced);
    const forwarded = goForwardScreen(backed);

    expect(backed).toEqual({
      current: "skills",
      backStack: ["home"],
      forwardStack: ["general"],
    });
    expect(forwarded).toEqual(advanced);
  });

  it("clears forward history after pushing a new screen", () => {
    const backed = goBackScreen(
      pushScreenHistory(
        pushScreenHistory(createScreenHistoryState("home"), "skills"),
        "general",
      ),
    );

    const next = pushScreenHistory(backed, "config");

    expect(next).toEqual({
      current: "config",
      backStack: ["home", "skills"],
      forwardStack: [],
    });
  });

  it("caps the back stack at five entries", () => {
    const screens: ReadonlyArray<AppScreen> = [
      "skills",
      "general",
      "appearance",
      "config",
      "agents",
      "about",
    ];
    const state = screens.reduce(
      (current, screen) => pushScreenHistory(current, screen),
      createScreenHistoryState("home"),
    );

    expect(state).toEqual({
      current: "about",
      backStack: ["skills", "general", "appearance", "config", "agents"],
      forwardStack: [],
    });
  });

  it("caps the forward stack at five entries when going back repeatedly", () => {
    const screens: ReadonlyArray<AppScreen> = [
      "skills",
      "general",
      "appearance",
      "config",
      "agents",
      "about",
    ];
    const advanced = screens.reduce(
      (current, screen) => pushScreenHistory(current, screen),
      createScreenHistoryState("home"),
    );

    let backed = advanced;
    for (let index = 0; index < 5; index += 1) {
      backed = goBackScreen(backed);
    }

    expect(backed).toEqual({
      current: "skills",
      backStack: [],
      forwardStack: ["general", "appearance", "config", "agents", "about"],
    });
  });

  it("reports navigation availability", () => {
    const state = pushScreenHistory(createScreenHistoryState("home"), "skills");
    const backed = goBackScreen(state);

    expect(canGoBackScreen(state)).toBe(true);
    expect(canGoForwardScreen(state)).toBe(false);
    expect(canGoBackScreen(backed)).toBe(false);
    expect(canGoForwardScreen(backed)).toBe(true);
  });
});
