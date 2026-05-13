import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
import { QuickPreviewPanel } from "./QuickPreviewPanel";

const { coreMocks, docxPreviewMocks } = vi.hoisted(() => ({
  coreMocks: {
    convertFileSrc: vi.fn((path: string) => `asset://${path}`),
  },
  docxPreviewMocks: {
    renderAsync: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => coreMocks);
vi.mock("docx-preview", () => docxPreviewMocks);

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function encodeBytesBase64(value: ReadonlyArray<number>): string {
  return Buffer.from(value).toString("base64");
}

function createRect(values: {
  readonly left?: number;
  readonly top?: number;
  readonly width: number;
  readonly height: number;
}): DOMRect {
  const left = values.left ?? 0;
  const top = values.top ?? 0;
  return {
    x: left,
    y: top,
    left,
    top,
    width: values.width,
    height: values.height,
    right: left + values.width,
    bottom: top + values.height,
    toJSON: () => ({}),
  } as DOMRect;
}

function createHostBridge(overrides?: {
  readonly readFileContent?: string;
  readonly readFileDataBase64?: string;
}): HostBridge {
  return {
    app: {
      openExternal: vi.fn().mockResolvedValue(undefined),
      revealPathInFolder: vi.fn().mockResolvedValue(undefined),
    },
    rpc: {
      request: vi.fn().mockResolvedValue({
        result: { dataBase64: overrides?.readFileDataBase64 ?? encodeBase64(overrides?.readFileContent ?? "") },
      }),
    },
  } as unknown as HostBridge;
}

describe("QuickPreviewPanel", () => {
  beforeEach(() => {
    coreMocks.convertFileSrc.mockClear();
    docxPreviewMocks.renderAsync.mockReset();
    docxPreviewMocks.renderAsync.mockImplementation(async (
      _bytes: Uint8Array,
      bodyContainer: HTMLElement,
      styleContainer: HTMLElement,
    ) => {
      Object.defineProperty(bodyContainer, "clientWidth", { configurable: true, value: 400 });
      styleContainer.appendChild(document.createElement("style"));
      const wrapper = document.createElement("div");
      wrapper.className = "codex-docx-preview-wrapper";
      const page = document.createElement("section");
      page.className = "codex-docx-preview";
      Object.defineProperty(page, "scrollWidth", { configurable: true, value: 800 });
      Object.defineProperty(page, "scrollHeight", { configurable: true, value: 1200 });
      page.getBoundingClientRect = vi.fn(() => createRect({ width: 800, height: 1200 }));
      const wideTable = document.createElement("table");
      wideTable.getBoundingClientRect = vi.fn(() => createRect({ width: 1000, height: 260 }));
      const image = document.createElement("img");
      image.alt = "结构图";
      image.src = "data:image/png;base64,AAAA";
      page.appendChild(wideTable);
      page.appendChild(image);
      wrapper.appendChild(page);
      bodyContainer.appendChild(wrapper);
    });
  });

  it("renders the opened file title as a full path breadcrumb", () => {
    const hostBridge = createHostBridge();

    render(
      <QuickPreviewPanel
        hostBridge={hostBridge}
        target={{
          kind: "file",
          fileKind: "document",
          path: "E:/code/codex-app-plus/docs/report.pdf",
          name: "report.pdf",
          extension: "PDF",
        }}
      />,
    );

    const breadcrumb = screen.getByRole("navigation", { name: "文件路径" });
    expect(within(breadcrumb).getByText("E:")).toBeInTheDocument();
    expect(within(breadcrumb).getByText("code")).toBeInTheDocument();
    expect(within(breadcrumb).getByText("codex-app-plus")).toBeInTheDocument();
    expect(within(breadcrumb).getByText("docs")).toBeInTheDocument();
    expect(within(breadcrumb).getByText("report.pdf")).toBeInTheDocument();
    expect(breadcrumb).toHaveAttribute("title", "E:/code/codex-app-plus/docs/report.pdf");
  });

  it("renders markdown documents instead of raw text", async () => {
    const hostBridge = createHostBridge({
      readFileContent: "# 标题\n\n- 第一项\n- 第二项",
    });

    const { container } = render(
      <QuickPreviewPanel
        hostBridge={hostBridge}
        target={{
          kind: "file",
          fileKind: "document",
          path: "E:/code/codex-app-plus/report.md",
          name: "report.md",
          extension: "MD",
        }}
      />,
    );

    expect(await screen.findByRole("heading", { name: "标题" })).toBeInTheDocument();
    expect(screen.getByText("第一项")).toBeInTheDocument();
    expect(container.querySelector(".quick-preview-text")).toBeNull();
  });

  it("renders docx documents with the official docx-preview renderer", async () => {
    const hostBridge = createHostBridge({
      readFileDataBase64: encodeBytesBase64([0x50, 0x4b, 0x03, 0x04]),
    });

    render(
      <QuickPreviewPanel
        hostBridge={hostBridge}
        target={{
          kind: "file",
          fileKind: "document",
          path: "E:/code/codex-app-plus/网站设计报告.docx",
          name: "网站设计报告.docx",
          extension: "DOCX",
        }}
      />,
    );

    expect(await screen.findByRole("img", { name: "结构图" })).toHaveAttribute("src", "data:image/png;base64,AAAA");
    await waitFor(() => expect(docxPreviewMocks.renderAsync).toHaveBeenCalledTimes(1));
    const [bytes, bodyContainer, styleContainer, options] = docxPreviewMocks.renderAsync.mock.calls[0];
    expect(Array.from(bytes as Uint8Array)).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(bodyContainer).toBeInstanceOf(HTMLElement);
    expect(styleContainer).toBeInstanceOf(HTMLElement);
    expect(options).toMatchObject({
      className: "codex-docx-preview",
      renderAltChunks: false,
      useBase64URL: true,
    });
    await waitFor(() =>
      expect((bodyContainer as HTMLElement).style.getPropertyValue("--codex-docx-preview-zoom")).toBe("0.352")
    );
    expect((styleContainer as HTMLElement).textContent).toContain("zoom: var(--codex-docx-preview-zoom, 1)");
    expect((bodyContainer as HTMLElement).querySelector(".quick-preview-docx-page-scale-frame")).toBeNull();
  });

  it("keeps pdf files embedded with the converted asset source", async () => {
    const hostBridge = createHostBridge();

    const { container } = render(
      <QuickPreviewPanel
        hostBridge={hostBridge}
        target={{
          kind: "file",
          fileKind: "document",
          path: "E:/code/codex-app-plus/report.pdf",
          name: "report.pdf",
          extension: "PDF",
        }}
      />,
    );

    await waitFor(() => expect(coreMocks.convertFileSrc).toHaveBeenCalledWith("E:/code/codex-app-plus/report.pdf"));
    expect(container.querySelector(".quick-preview-document-object")).toHaveAttribute("data", "asset://E:/code/codex-app-plus/report.pdf");
  });
});
