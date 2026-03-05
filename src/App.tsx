import type { HostBridge } from "./bridge/types";
import { ControlBar } from "./components/ControlBar";
import { InspectorPanel } from "./components/InspectorPanel";
import { Sidebar } from "./components/Sidebar";
import { TimelinePanel } from "./components/TimelinePanel";
import { useAppController } from "./app/useAppController";

interface AppProps {
  readonly hostBridge: HostBridge;
}

export function App({ hostBridge }: AppProps): JSX.Element {
  const controller = useAppController(hostBridge);
  const { state } = controller;

  return (
    <div className="app-root">
      <ControlBar
        status={state.connectionStatus}
        activeView={state.activeView}
        busy={state.busy}
        onViewChange={controller.setView}
        onStart={controller.start}
        onStop={controller.stop}
        onInitialize={controller.initialize}
        onLogin={controller.login}
        onLoadThreads={controller.loadThreads}
        onLoadModels={controller.loadModels}
        onReadConfig={controller.readConfig}
        onImport={controller.importOfficialData}
      />
      <main className="workspace">
        <Sidebar
          threads={state.threads}
          selectedThreadId={state.selectedThreadId}
          onSelect={controller.selectThread}
        />
        <TimelinePanel
          selectedThreadId={state.selectedThreadId}
          timeline={state.timeline}
          inputText={state.inputText}
          busy={state.busy}
          onInputChange={controller.setInput}
          onCreateThread={controller.createThread}
          onSendTurn={controller.sendTurn}
        />
        <InspectorPanel
          activeView={state.activeView}
          notifications={state.notifications}
          pendingRequests={state.pendingServerRequests}
          models={state.models}
          configSnapshot={state.configSnapshot}
          onApproveRequest={controller.approveRequest}
          onRejectRequest={controller.rejectRequest}
        />
      </main>
      {state.fatalError ? <div className="fatal-banner">FATAL: {state.fatalError}</div> : null}
    </div>
  );
}
