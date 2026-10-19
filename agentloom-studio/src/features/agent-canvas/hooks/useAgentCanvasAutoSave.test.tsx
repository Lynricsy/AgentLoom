import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DEBOUNCE_MS } from "@/features/canvas";
import { useAgentCanvasStore } from "../stores/agent-canvas.store";
import { useAgentCanvasAutoSave } from "./useAgentCanvasAutoSave";

const actions = () => useAgentCanvasStore.getState().actions;

function editInputSchema(topic: string) {
  act(() => {
    actions().setInputSchema({
      type: "object",
      properties: { [topic]: { type: "string" } },
    });
  });
}

describe("useAgentCanvasAutoSave", () => {
  const saveCanvas = vi.fn<() => Promise<void>>();
  const onError = vi.fn();

  function renderAutoSave(enabled = true) {
    return renderHook(() =>
      useAgentCanvasAutoSave("agent-1", { enabled, saveCanvas, onError }),
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    actions().reset();
    useAgentCanvasStore.setState({ agentId: "agent-1", version: 3 });
    saveCanvas.mockReset();
    onError.mockReset();
    saveCanvas.mockImplementation(async () => {
      actions().beginSaving();
      actions().acknowledgeSaved(useAgentCanvasStore.getState().version + 1);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("编辑后按 VITE_AUTOSAVE_DEBOUNCE_MS 防抖保存，连续编辑只保存一次", async () => {
    renderAutoSave();

    editInputSchema("a");
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1);
    });
    editInputSchema("b");
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1);
    });
    expect(saveCanvas).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(saveCanvas).toHaveBeenCalledTimes(1);
    expect(useAgentCanvasStore.getState().isDirty).toBe(false);
  });

  it("保存期间的编辑在保存返回后再排一次保存", async () => {
    saveCanvas.mockImplementationOnce(async () => {
      actions().beginSaving();
      actions().setInputSchema({ type: "object", properties: {} });
      actions().advanceVersion(4);
    });
    renderAutoSave();

    editInputSchema("a");
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(saveCanvas).toHaveBeenCalledTimes(1);
    expect(useAgentCanvasStore.getState().isDirty).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(saveCanvas).toHaveBeenCalledTimes(2);
    expect(useAgentCanvasStore.getState().isDirty).toBe(false);
  });

  it("保存失败交给 onError，不自动重试", async () => {
    const failure = new Error("save failed");
    saveCanvas.mockImplementation(async () => {
      actions().beginSaving();
      actions().failSaving();
      throw failure;
    });
    renderAutoSave();

    editInputSchema("a");
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 3);
    });

    expect(saveCanvas).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("不可编辑（小屏只读）时不自动保存", async () => {
    renderAutoSave(false);

    editInputSchema("a");
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2);
    });

    expect(saveCanvas).not.toHaveBeenCalled();
  });

  it("防抖期内被暂停（离开确认框打开）则不保存，恢复后补存未保存修改", async () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAgentCanvasAutoSave("agent-1", { enabled, saveCanvas, onError }),
      { initialProps: { enabled: true } },
    );

    editInputSchema("a");
    rerender({ enabled: false });
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2);
    });
    expect(saveCanvas).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(saveCanvas).toHaveBeenCalledTimes(1);
  });
});
