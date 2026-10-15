import { describe, expect, it } from "vitest";
import {
  MAX_GROUP_NAME_LENGTH,
  normalizeGroupName,
  normalizeJoinCode,
  normalizeUuid,
  trimGroupName,
} from "@/lib/group-rules";

// Oracles: the DB CHECK on groups.name trims space, tab, CR and LF and counts code points (char_length); a join code
// is 1-64 lowercase hex characters (older groups 8, new ones 12); a user id is only accepted in its canonical
// hyphenated spelling.

const NBSP = String.fromCodePoint(0x00a0);
const EM_SPACE = String.fromCodePoint(0x2003);

describe("trimGroupName", () => {
  it("trims space, tab, CR and LF at both ends", () => {
    expect(trimGroupName(" \t\r\nTeam \t\r\n")).toBe("Team");
  });

  it("keeps inner whitespace", () => {
    expect(trimGroupName("  Team  A  ")).toBe("Team  A");
  });

  it("does not trim NBSP or other Unicode spaces", () => {
    expect(trimGroupName(`${NBSP}Team${NBSP}`)).toBe(`${NBSP}Team${NBSP}`);
    expect(trimGroupName(`${EM_SPACE}Team`)).toBe(`${EM_SPACE}Team`);
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(trimGroupName(" \t\r\n")).toBe("");
  });
});

describe("normalizeGroupName", () => {
  it("returns the trimmed name", () => {
    expect(normalizeGroupName("  \tRunners \r\n")).toBe("Runners");
  });

  it("rejects non-strings, empty and whitespace-only input", () => {
    for (const input of [undefined, null, 42, {}, [], true, "", "   ", " \t\r\n "]) {
      expect(normalizeGroupName(input)).toBeNull();
    }
  });

  it("accepts 80 code points and rejects 81 (ASCII)", () => {
    expect(MAX_GROUP_NAME_LENGTH).toBe(80);
    expect(normalizeGroupName("a".repeat(80))).toBe("a".repeat(80));
    expect(normalizeGroupName("a".repeat(81))).toBeNull();
  });

  it("counts code points, not UTF-16 units (emoji)", () => {
    expect(normalizeGroupName("😀".repeat(80))).toBe("😀".repeat(80));
    expect(normalizeGroupName("😀".repeat(81))).toBeNull();
  });

  it("counts after trimming, so padding does not push a name over the limit", () => {
    expect(normalizeGroupName(`  ${"a".repeat(80)}  `)).toBe("a".repeat(80));
  });

  it("keeps NBSP, which counts as a character", () => {
    expect(normalizeGroupName(NBSP)).toBe(NBSP);
    expect(normalizeGroupName(`${NBSP}${"a".repeat(80)}`)).toBeNull();
  });
});

describe("normalizeJoinCode", () => {
  it("accepts a bare code", () => {
    expect(normalizeJoinCode("a1b2c3d4e5f6")).toBe("a1b2c3d4e5f6");
    expect(normalizeJoinCode("  a1b2c3d4  ")).toBe("a1b2c3d4");
  });

  it("lowercases an uppercase code", () => {
    expect(normalizeJoinCode("A1B2C3D4E5F6")).toBe("a1b2c3d4e5f6");
  });

  it("takes the last path segment of a pasted invite link", () => {
    expect(normalizeJoinCode("https://streak.example/join/a1b2c3d4e5f6")).toBe("a1b2c3d4e5f6");
    expect(normalizeJoinCode("https://streak.example/join/a1b2c3d4e5f6/")).toBe("a1b2c3d4e5f6");
    expect(normalizeJoinCode("https://streak.example/join/a1b2c3d4e5f6?utm=x")).toBe("a1b2c3d4e5f6");
    expect(normalizeJoinCode("https://streak.example/join/a1b2c3d4e5f6#top")).toBe("a1b2c3d4e5f6");
    expect(normalizeJoinCode("https://streak.example/join/A1B2C3D4E5F6/?x=1#y")).toBe("a1b2c3d4e5f6");
  });

  it("accepts 1 and 64 hex characters and rejects 65", () => {
    expect(normalizeJoinCode("a")).toBe("a");
    expect(normalizeJoinCode("f".repeat(64))).toBe("f".repeat(64));
    expect(normalizeJoinCode("f".repeat(65))).toBeNull();
  });

  it("rejects non-hex, empty and non-string input", () => {
    for (const input of ["xyz", "a1b2-c3d4", "a1b2 c3d4", "", "   ", "/", "https://streak.example/join/", undefined]) {
      expect(normalizeJoinCode(input)).toBeNull();
    }
    for (const input of [null, 12345678, {}]) {
      expect(normalizeJoinCode(input)).toBeNull();
    }
  });
});

describe("normalizeUuid", () => {
  const LOWER = "0f8fad5b-d9cb-469f-a165-70867728950e";

  it("returns a canonical lowercase uuid unchanged", () => {
    expect(normalizeUuid(LOWER)).toBe(LOWER);
  });

  it("lowercases a canonical uppercase uuid", () => {
    expect(normalizeUuid(LOWER.toUpperCase())).toBe(LOWER);
  });

  it("rejects the braced and hyphenless spellings Postgres would read", () => {
    expect(normalizeUuid(`{${LOWER}}`)).toBeNull();
    expect(normalizeUuid(LOWER.replaceAll("-", ""))).toBeNull();
  });

  it("rejects padding, malformed and non-string input", () => {
    for (const input of [` ${LOWER}`, `${LOWER}\n`, "0f8fad5b-d9cb-469f-a165-70867728950", "not-a-uuid", ""]) {
      expect(normalizeUuid(input)).toBeNull();
    }
    for (const input of [undefined, null, 1, {}]) {
      expect(normalizeUuid(input)).toBeNull();
    }
  });
});
