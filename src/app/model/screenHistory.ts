import type { AppScreen } from "../ui/AppScreenContent";

const MAX_SCREEN_HISTORY = 5;

export interface ScreenHistoryState {
  readonly current: AppScreen;
  readonly backStack: ReadonlyArray<AppScreen>;
  readonly forwardStack: ReadonlyArray<AppScreen>;
}

export function createScreenHistoryState(current: AppScreen): ScreenHistoryState {
  return {
    current,
    backStack: [],
    forwardStack: [],
  };
}

function isSettingsScreen(screen: AppScreen): boolean {
  return screen !== "home" && screen !== "skills";
}

function capBackStack(backStack: ReadonlyArray<AppScreen>): ReadonlyArray<AppScreen> {
  if (backStack.length <= MAX_SCREEN_HISTORY) {
    return backStack;
  }
  return backStack.slice(-MAX_SCREEN_HISTORY);
}

export function pushScreenHistory(state: ScreenHistoryState, next: AppScreen): ScreenHistoryState {
  if (state.current === next) {
    return state;
  }
  if (isSettingsScreen(state.current) && isSettingsScreen(next)) {
    return {
      current: next,
      backStack: state.backStack,
      forwardStack: [],
    };
  }
  const backStack = capBackStack([...state.backStack, state.current]);
  return {
    current: next,
    backStack,
    forwardStack: [],
  };
}

export function canGoBackScreen(state: ScreenHistoryState): boolean {
  return state.backStack.length > 0;
}

export function canGoForwardScreen(state: ScreenHistoryState): boolean {
  return state.forwardStack.length > 0;
}

export function goBackScreen(state: ScreenHistoryState): ScreenHistoryState {
  if (state.backStack.length === 0) {
    return state;
  }
  const previous = state.backStack[state.backStack.length - 1] ?? state.current;
  return {
    current: previous,
    backStack: state.backStack.slice(0, -1),
    forwardStack: [state.current, ...state.forwardStack].slice(0, MAX_SCREEN_HISTORY),
  };
}

export function goForwardScreen(state: ScreenHistoryState): ScreenHistoryState {
  if (state.forwardStack.length === 0) {
    return state;
  }
  const next = state.forwardStack[0] ?? state.current;
  return {
    current: next,
    backStack: capBackStack([...state.backStack, state.current]),
    forwardStack: state.forwardStack.slice(1),
  };
}
