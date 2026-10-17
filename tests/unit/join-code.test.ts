import type { AstroCookies } from "astro";
import { describe, expect, it, vi } from "vitest";
import { JOIN_CODE_COOKIE, clearJoinCode, peekJoinCode, rememberJoinCode } from "@/lib/join-code";

const CODE = "a1b2c3d4e5f6";

function cookieStub(stored?: string) {
  const stub = {
    get: vi.fn((name: string) => (name === JOIN_CODE_COOKIE && stored !== undefined ? { value: stored } : undefined)),
    set: vi.fn(),
    delete: vi.fn(),
  };
  return { stub, cookies: stub as unknown as AstroCookies };
}

describe("rememberJoinCode", () => {
  it("stores a normalised code with path /, httpOnly, lax and a one-week age", () => {
    const { stub, cookies } = cookieStub();

    rememberJoinCode(cookies, `https://streak.example/join/${CODE.toUpperCase()}?x=1`);

    // The cookie is named `join_code` (README, Smoke test; CLAUDE.md): the smoke steps look for it by that name
    expect(JOIN_CODE_COOKIE).toBe("join_code");
    expect(stub.set).toHaveBeenCalledOnce();
    expect(stub.set).toHaveBeenCalledWith(JOIN_CODE_COOKIE, CODE, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 604800,
    });
  });

  it("ignores an invalid code", () => {
    const { stub, cookies } = cookieStub();

    for (const input of ["not hex!", "", undefined, null, 42]) {
      rememberJoinCode(cookies, input);
    }

    expect(stub.set).not.toHaveBeenCalled();
    expect(stub.delete).not.toHaveBeenCalled();
  });
});

describe("peekJoinCode", () => {
  it("returns the stored code without consuming it", () => {
    const { stub, cookies } = cookieStub(CODE);

    expect(peekJoinCode(cookies)).toBe(CODE);
    expect(stub.get).toHaveBeenCalledWith(JOIN_CODE_COOKIE);
    expect(stub.delete).not.toHaveBeenCalled();
  });

  it("drops a forged cookie value", () => {
    for (const forged of ["<script>", "../join/x", "f".repeat(65), ""]) {
      expect(peekJoinCode(cookieStub(forged).cookies)).toBeNull();
    }
  });

  it("returns null when the cookie is absent", () => {
    expect(peekJoinCode(cookieStub().cookies)).toBeNull();
  });
});

describe("clearJoinCode", () => {
  it("deletes the cookie repeating the path it was set with", () => {
    const { stub, cookies } = cookieStub(CODE);

    clearJoinCode(cookies);

    expect(stub.delete).toHaveBeenCalledOnce();
    expect(stub.delete).toHaveBeenCalledWith(JOIN_CODE_COOKIE, { path: "/" });
  });
});
