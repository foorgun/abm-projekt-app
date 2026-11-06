// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { AuthApi } from "../lib/auth";
import { SessionProvider } from "../lib/session";
import { KontoKarte } from "./KontoKarte";
import { ToastProvider } from "./Toast";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
const auth = (role: "admin" | "freiberufler"): AuthApi => ({
  current: async () => ({ id: "1", email: "f@example.com", profile: { name: "F", role } }),
  signIn: async () => ({ id: "1", email: "f@example.com", profile: null }),
  signOut: async () => undefined,
  changePassword: async () => undefined,
  onChange: () => () => undefined,
});

async function render(a: AuthApi | null) {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <SessionProvider auth={a}>
        <ToastProvider>
          <KontoKarte />
        </ToastProvider>
      </SessionProvider>,
    ),
  );
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
const button = () => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Passwort ändern"));

describe("KontoKarte", () => {
  it("zeigt jeder Rolle, auch Freiberuflern, das Konto und öffnet „Passwort ändern“", async () => {
    await render(auth("freiberufler"));
    expect(document.body.textContent).toContain("Angemeldet als f@example.com");
    await act(async () => button()!.click());
    expect(document.getElementById("change-password")).not.toBeNull();
  });
  it("fehlt im Demo-Modus (keine Anmeldung, kein Passwort)", async () => {
    await render(null);
    expect(button()).toBeUndefined();
  });
});
