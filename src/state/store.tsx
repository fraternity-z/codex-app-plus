import { createContext, useContext, useMemo, useReducer } from "react";
import type { PropsWithChildren } from "react";
import type { AppAction, AppState } from "../domain/types";
import { appReducer, createInitialState } from "./appReducer";

interface StoreValue {
  readonly state: AppState;
  dispatch: (action: AppAction) => void;
}

const AppStoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({ children }: PropsWithChildren): JSX.Element {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);
  const value = useMemo<StoreValue>(() => ({ state, dispatch }), [state]);
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): StoreValue {
  const context = useContext(AppStoreContext);
  if (context === null) {
    throw new Error("useAppStore 必须在 AppStoreProvider 内部使用");
  }
  return context;
}
