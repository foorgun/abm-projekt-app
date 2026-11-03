// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthApi } from "../lib/auth";
import { SessionProvider } from "../lib/session";
import { ChangePasswordDialog } from "./ChangePasswordDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const changePassword = vi.fn<AuthApi["changePassword"]>();
const onChanged = vi.fn();
const auth: AuthApi = {
  current: async () => ({ id: "1", email: "a@example.com", profile: { name: "A", role: "admin" } }),
  signIn: async () => ({ id: "1", email: "a@example.com", profile: null }),
  signOut: async () => undefined,
  changePassword,
  onChange: () => () => undefined,
};

function type(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
const fill = (current: string, next: string, repeat = next) =>
  act(() => {
    type("password-current", current);
    type("password-next", next);
    type("password-repeat", repeat);
  });
const submit = () => act(async () => void document.getElementById("change-password")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const alertText = () => document.querySelector("[role=alert]")?.textContent;

beforeEach(async () => {
  vi.resetAllMocks();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () =>
    root.render(
      <SessionProvider auth={auth}>
        <ChangePasswordDialog onClose={() => undefined} onChanged={onChanged} />
      </SessionProvider>,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ChangePasswordDialog", () => {
  it("schickt ein zu kurzes Passwort gar nicht ab", async () => {
    fill("alt", "kurz");
    await submit();
    expect(alertText()).toContain("mindestens 12");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("schickt abweichende Wiederholung gar nicht ab", async () => {
    fill("alt", "neu-neu-neu-neu", "neu-neu-neu-nee");
    await submit();
    expect(alertText()).toContain("nicht überein");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("meldet den Erfolg an den Aufrufer", async () => {
    changePassword.mockResolvedValue();
    fill("alt", "neu-neu-neu-neu");
    await submit();
    expect(changePassword).toHaveBeenCalledWith("alt", "neu-neu-neu-neu");
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("zeigt den Fehler, leert das aktuelle Passwort und bleibt offen", async () => {
    changePassword.mockRejectedValue(new Error("Das aktuelle Passwort stimmt nicht."));
    fill("falsch", "neu-neu-neu-neu");
    await submit();
    expect(alertText()).toContain("aktuelle Passwort stimmt nicht");
    expect((document.getElementById("password-current") as HTMLInputElement).value).toBe("");
    expect(onChanged).not.toHaveBeenCalled();
  });
});
