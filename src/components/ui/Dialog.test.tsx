// @vitest-environment jsdom
// Klick neben den Dialog: schließt normal, aber nicht bei Formularen mit keepOpenOnOutsideClick.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function show(keep: boolean) {
  const onClose = vi.fn();
  act(() =>
    root.render(
      <Dialog title="Test" onClose={onClose} keepOpenOnOutsideClick={keep}>
        <input />
      </Dialog>,
    ),
  );
  const press = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  return { onClose, press, backdrop: host.querySelector(".dialog-backdrop")!, box: host.querySelector(".dialog")! };
}

describe("Dialog", () => {
  it("schließt ohne die Option beim Klick daneben", () => {
    const { onClose, press, backdrop } = show(false);
    press(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("bleibt mit der Option beim Klick daneben offen", () => {
    const { onClose, press, backdrop } = show(true);
    press(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });
  it("Schließen-Knopf und Escape schließen auch mit der Option", () => {
    const { onClose } = show(true);
    act(() => host.querySelector<HTMLButtonElement>("[data-close]")!.click());
    act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
