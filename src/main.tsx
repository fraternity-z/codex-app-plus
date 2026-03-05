import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { createTauriHostBridge } from "./bridge/tauriHostBridge";
import { AppStoreProvider } from "./state/store";
import "./styles.css";

const hostBridge = createTauriHostBridge();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppStoreProvider>
      <App hostBridge={hostBridge} />
    </AppStoreProvider>
  </React.StrictMode>
);
