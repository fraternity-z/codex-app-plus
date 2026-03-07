import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeChatMessage } from "./HomeChatMessage";

describe("HomeChatMessage", () => {
  it("renders image previews above the user bubble", () => {
    const dataUrl = "data:image/png;base64,aGVsbG8=";

    const { container } = render(
      <HomeChatMessage
        message={{
          id: "user-1",
          kind: "userMessage",
          role: "user",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-1",
          text: "请看附件",
          status: "done",
          attachments: [{ kind: "image", source: "dataUrl", value: dataUrl }]
        }}
      />
    );

    expect(screen.getByText("请看附件")).toBeInTheDocument();
    expect(container.querySelector(".home-chat-attachments img")?.getAttribute("src")).toBe(dataUrl);
  });
});
