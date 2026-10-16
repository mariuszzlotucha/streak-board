import { describe, expect, it } from "vitest";
import { MAX_NICKNAME_LENGTH, MIN_NICKNAME_LENGTH, normalizeNickname, trimNickname } from "@/lib/nickname-rules";

// Oracles (S-14 plan, migration add_nicknames): the DB CHECKs on nicknames.nickname require the value to equal its trim
// of space, tab, CR and LF, and to be 2-24 code points long (char_length). Uniqueness is exact and lives only in the
// database, so it is not a rule here.

const NBSP = String.fromCodePoint(0x00a0);
const EM_SPACE = String.fromCodePoint(0x2003);

describe("trimNickname", () => {
  it("trims space, tab, CR and LF at both ends", () => {
    expect(trimNickname(" \t\r\nKasia \t\r\n")).toBe("Kasia");
  });

  it("keeps inner whitespace", () => {
    expect(trimNickname("  Kasia  K  ")).toBe("Kasia  K");
  });

  it("does not trim NBSP or other Unicode spaces", () => {
    expect(trimNickname(`${NBSP}Kasia${NBSP}`)).toBe(`${NBSP}Kasia${NBSP}`);
    expect(trimNickname(`${EM_SPACE}Kasia`)).toBe(`${EM_SPACE}Kasia`);
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(trimNickname(" \t\r\n")).toBe("");
  });
});

describe("normalizeNickname", () => {
  it("returns the trimmed nickname", () => {
    expect(normalizeNickname("  \tKasia \r\n")).toBe("Kasia");
  });

  it("rejects non-strings, empty and whitespace-only input", () => {
    for (const input of [undefined, null, 42, {}, [], true, "", "   ", " \t\r\n "]) {
      expect(normalizeNickname(input)).toBeNull();
    }
  });

  it("rejects 1 code point, accepts 2 and 24, rejects 25 (ASCII)", () => {
    expect(MIN_NICKNAME_LENGTH).toBe(2);
    expect(MAX_NICKNAME_LENGTH).toBe(24);
    expect(normalizeNickname("a")).toBeNull();
    expect(normalizeNickname("ab")).toBe("ab");
    expect(normalizeNickname("a".repeat(24))).toBe("a".repeat(24));
    expect(normalizeNickname("a".repeat(25))).toBeNull();
  });

  it("counts code points, not UTF-16 units (emoji)", () => {
    expect(normalizeNickname("😀")).toBeNull();
    expect(normalizeNickname("😀😀")).toBe("😀😀");
    expect(normalizeNickname("😀".repeat(24))).toBe("😀".repeat(24));
    expect(normalizeNickname("😀".repeat(25))).toBeNull();
  });

  it("counts after trimming, so padding neither pushes a nickname over the limit nor makes a short one long enough", () => {
    expect(normalizeNickname(`     ${"a".repeat(24)}\t\t`)).toBe("a".repeat(24));
    expect(normalizeNickname(`     ${"a".repeat(25)}\t\t`)).toBeNull();
    expect(normalizeNickname("  a  ")).toBeNull();
  });

  it("keeps NBSP, which counts as a character", () => {
    expect(normalizeNickname(`${NBSP}${NBSP}`)).toBe(`${NBSP}${NBSP}`);
    expect(normalizeNickname(`${NBSP}a`)).toBe(`${NBSP}a`);
    expect(normalizeNickname(`${NBSP}${"a".repeat(24)}`)).toBeNull();
  });
});
