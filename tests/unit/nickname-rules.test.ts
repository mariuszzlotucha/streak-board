import { describe, expect, it } from "vitest";
import {
  BLANK_NICKNAME_RANGES,
  FORBIDDEN_NICKNAME_RANGES,
  MAX_NICKNAME_LENGTH,
  MIN_NICKNAME_LENGTH,
  isVisibleNickname,
  normalizeNickname,
  trimNickname,
  type CodePointRange,
} from "@/lib/nickname-rules";

// Oracles (S-14 plan, migration add_nicknames, impl review F3): the DB CHECKs on nicknames.nickname require the value
// to equal its trim of space, tab, CR and LF, to be 2-24 code points long (char_length), to hold no Unicode control or
// format character except ZWNJ and ZWJ, and to have at least one character outside the blank set. Uniqueness is exact
// and lives only in the database, so it is not a rule here.

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

  it("keeps NBSP, which counts as a character, but not as a visible one", () => {
    expect(normalizeNickname(`${NBSP}a`)).toBe(`${NBSP}a`);
    expect(normalizeNickname(`${NBSP}${"a".repeat(24)}`)).toBeNull();
    expect(normalizeNickname(`${NBSP}${NBSP}`)).toBeNull();
  });

  it("rejects control and format characters anywhere, and nicknames with nothing visible", () => {
    for (const codePoint of [0x0000, 0x0009, 0x007f, 0x00ad, 0x200b, 0x200e, 0x202e, 0x2066, 0xfeff, 0xe0041]) {
      const char = String.fromCodePoint(codePoint);
      expect(normalizeNickname(`Ka${char}sia`), codePoint.toString(16)).toBeNull();
    }
    for (const blank of [`${EM_SPACE}${EM_SPACE}`, "ㅤㅤ", "⠀⠀", "‍‍", "️️"]) {
      expect(normalizeNickname(blank), JSON.stringify(blank)).toBeNull();
    }
  });

  it("accepts the joiners inside a visible nickname (emoji sequences, ZWNJ scripts)", () => {
    expect(normalizeNickname("👩‍💻 Ada")).toBe("👩‍💻 Ada");
    expect(normalizeNickname("می‌خواهم")).toBe("می‌خواهم");
    expect(normalizeNickname(`Ka${EM_SPACE}sia`)).toBe(`Ka${EM_SPACE}sia`);
  });
});

describe("isVisibleNickname", () => {
  const inRanges = (ranges: readonly CodePointRange[], codePoint: number) =>
    ranges.some(([from, to]) => codePoint >= from && codePoint <= to);

  // The ranges are spelled out for the DB CHECK; this pins them to the runtime's Unicode data in both directions, so a
  // Unicode update that adds a format character fails here instead of silently diverging from the database.
  it("forbids exactly \\p{Cc} and \\p{Cf} except ZWNJ and ZWJ", () => {
    const controlOrFormat = /^[\p{Cc}\p{Cf}]$/u;
    const mismatches: string[] = [];
    for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
      const expected =
        controlOrFormat.test(String.fromCodePoint(codePoint)) && codePoint !== 0x200c && codePoint !== 0x200d;
      if (inRanges(FORBIDDEN_NICKNAME_RANGES, codePoint) !== expected) mismatches.push(codePoint.toString(16));
    }
    expect(mismatches).toEqual([]);
  });

  it("treats every forbidden range endpoint as forbidden and every blank one as blank", () => {
    for (const [from, to] of FORBIDDEN_NICKNAME_RANGES) {
      for (const codePoint of [from, to]) {
        expect(isVisibleNickname(`a${String.fromCodePoint(codePoint)}b`), codePoint.toString(16)).toBe(false);
      }
    }
    for (const [from, to] of BLANK_NICKNAME_RANGES) {
      for (const codePoint of [from, to]) {
        const char = String.fromCodePoint(codePoint);
        expect(isVisibleNickname(`${char}${char}`), codePoint.toString(16)).toBe(false);
        expect(isVisibleNickname(`a${char}b`), codePoint.toString(16)).toBe(true);
      }
    }
  });
});
