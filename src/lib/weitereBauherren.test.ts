import { describe, expect, it } from "vitest";
import { weitereSichtbar } from "./weitereBauherren";

describe("weitereSichtbar", () => {
  it("zeigt so viele wie angefordert, höchstens drei weitere", () => {
    expect(weitereSichtbar(null, 0)).toBe(0);
    expect(weitereSichtbar({}, 2)).toBe(2);
    expect(weitereSichtbar({}, 9)).toBe(3);
  });
  it("zeigt immer bis zum letzten ausgefüllten, auch beim Fortsetzen eines Entwurfs", () => {
    expect(weitereSichtbar({ phone2: "0731 1" }, 0)).toBe(1);
    expect(weitereSichtbar({ email4: "d@example.com" }, 0)).toBe(3);
    expect(weitereSichtbar({ name3: "C" }, 3)).toBe(3);
  });
  it("leere Werte zählen nicht", () => {
    expect(weitereSichtbar({ name2: "", name3: null }, 0)).toBe(0);
  });
});
