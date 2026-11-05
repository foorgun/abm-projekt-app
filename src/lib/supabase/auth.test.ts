import { beforeEach, describe, expect, it, vi } from "vitest";
import { authErrorMessage } from "../auth";
import { createSupabaseAuth } from "./auth";

const auth = {
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
};
vi.mock("./client", () => ({ getSupabase: () => ({ auth }) }));

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { user: { email: "a@example.com" } } }, error: null });
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

describe("changePassword", () => {
  it("prüft zuerst das aktuelle Passwort, setzt dann das neue und beendet andere Sitzungen", async () => {
    await createSupabaseAuth().changePassword("alt", "neu-neu-neu-neu");
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@example.com", password: "alt" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "neu-neu-neu-neu" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(auth.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
  });

  it("ändert nichts, wenn das aktuelle Passwort falsch ist", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error("Invalid login credentials") });
    await expect(createSupabaseAuth().changePassword("falsch", "neu-neu-neu-neu")).rejects.toThrow("aktuelle Passwort stimmt nicht");
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("ändert nichts ohne Sitzung", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(createSupabaseAuth().changePassword("alt", "neu-neu-neu-neu")).rejects.toThrow("Nicht angemeldet");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("meldet es, wenn der Dienst das neue Passwort ablehnt", async () => {
    auth.updateUser.mockResolvedValue({ error: new Error("New password should be different from the old password.") });
    const error = await createSupabaseAuth().changePassword("alt", "neu-neu-neu-neu").catch((e) => e);
    expect(authErrorMessage(error)).toContain("unterscheiden");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("gilt als geändert, auch wenn das Beenden anderer Sitzungen scheitert", async () => {
    auth.signOut.mockRejectedValue(new Error("Netz weg"));
    await expect(createSupabaseAuth().changePassword("alt", "neu-neu-neu-neu")).resolves.toBeUndefined();
  });
});
