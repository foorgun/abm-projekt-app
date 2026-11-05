import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "./password";

const GUT = "x".repeat(MIN_PASSWORD_LENGTH);

describe("validateNewPassword", () => {
  it("verlangt mindestens 12 Zeichen", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(validateNewPassword("alt", "x".repeat(11), "x".repeat(11))).toContain("mindestens 12");
    expect(validateNewPassword("alt", GUT, GUT)).toBeNull();
  });
  it("verlangt das aktuelle Passwort", () => {
    expect(validateNewPassword("", GUT, GUT)).toContain("aktuelle");
  });
  it("verlangt zweimal dasselbe", () => {
    expect(validateNewPassword("alt", GUT, `${GUT}y`)).toContain("nicht überein");
  });
  it("lehnt das bisherige Passwort ab", () => {
    expect(validateNewPassword(GUT, GUT, GUT)).toContain("unterscheiden");
  });
});
