import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComposerPermissionLevel } from "../../app/composerPermission";
import type { ComposerModelOption } from "../../app/composerPreferences";
import { HomeComposer } from "./HomeComposer";

const MODELS: ReadonlyArray<ComposerModelOption> = [{
  id: "model-1",
  value: "gpt-5.2",
  label: "GPT-5.2",
  defaultEffort: "xhigh",
  supportedEfforts: ["minimal", "low", "medium", "high", "xhigh"],
  isDefault: true
}];

function ComposerHarness(props: {
  readonly initialPermissionLevel: ComposerPermissionLevel;
  readonly onSendTurn: ReturnType<typeof vi.fn>;
}): JSX.Element {
  const [permissionLevel, setPermissionLevel] = useState<ComposerPermissionLevel>(props.initialPermissionLevel);
  return (
    <HomeComposer
      busy={false}
      inputText="检查权限链路"
      models={MODELS}
      defaultModel="gpt-5.2"
      defaultEffort="xhigh"
      selectedRootPath="E:/code/FPGA"
      queuedFollowUps={[]}
      followUpQueueMode="queue"
      composerEnterBehavior="enter"
      permissionLevel={permissionLevel}
      isResponding={false}
      interruptPending={false}
      onInputChange={vi.fn()}
      onSendTurn={props.onSendTurn}
      onSelectPermissionLevel={setPermissionLevel}
      onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
      onRemoveQueuedFollowUp={vi.fn()}
      onClearQueuedFollowUps={vi.fn()}
    />
  );
}

describe("HomeComposer permission", () => {
  it("renders persisted permission label", () => {
    render(<ComposerHarness initialPermissionLevel="full" onSendTurn={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByRole("button", { name: /完全访问权限/ })).toBeInTheDocument();
  });

  it("submits with the selected permission level", () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    render(<ComposerHarness initialPermissionLevel="default" onSendTurn={onSendTurn} />);

    fireEvent.click(screen.getByRole("button", { name: /默认权限/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /完全访问权限/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({ permissionLevel: "full" }));
  });

  it("switches back to default permission before submit", () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    render(<ComposerHarness initialPermissionLevel="full" onSendTurn={onSendTurn} />);

    fireEvent.click(screen.getByRole("button", { name: /完全访问权限/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /默认权限/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({ permissionLevel: "default" }));
  });
});
