/**
 * Oracle for Web Push (S-16, plan Phase 3): the RFC 8291 §5 test vector for aes128gcm encryption, and the VAPID JWT
 * (RFC 8292) checked by decoding its claims and verifying its signature with the public key.
 */
import { describe, expect, it } from "vitest";
import {
  base64UrlDecode,
  base64UrlEncode,
  buildPushRequest,
  encryptPayload,
  importEcdhPrivateKey,
  importVapidKeys,
  PUSH_TTL,
} from "@/lib/reminders/web-push";

// RFC 8291 §5.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_y" +
    "l95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

async function rfcOverrides() {
  return {
    serverKeys: {
      privateKey: await importEcdhPrivateKey(RFC.asPrivate, RFC.asPublic),
      publicKey: base64UrlDecode(RFC.asPublic),
    },
    salt: base64UrlDecode(RFC.salt),
  };
}

async function vapidPair() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { verifyKey: pair.publicKey, publicKey: base64UrlEncode(publicRaw), privateKey: jwk.d ?? "" };
}

function decodeJson(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as Record<string, unknown>;
}

const now = new Date("2026-10-04T18:00:00Z");
const sub = { endpoint: "https://push.example.com/send/abc?x=1", p256dh: RFC.uaPublic, auth: RFC.authSecret };

describe("encryptPayload", () => {
  it("reproduces the RFC 8291 test vector", async () => {
    const body = await encryptPayload(
      { p256dh: RFC.uaPublic, auth: RFC.authSecret },
      RFC.plaintext,
      await rfcOverrides(),
    );
    expect(base64UrlEncode(body)).toBe(RFC.body);
  });

  it("uses a fresh salt and server key when none is injected", async () => {
    const a = await encryptPayload(sub, "hi");
    const b = await encryptPayload(sub, "hi");
    expect(a.slice(0, 16)).not.toEqual(b.slice(0, 16));
    expect(a.slice(21, 86)).not.toEqual(b.slice(21, 86));
    // Header: rs 4096, idlen 65, an uncompressed point; then "hi" + delimiter + the 16-byte tag.
    expect([...a.slice(16, 22)]).toEqual([0, 0, 16, 0, 65, 4]);
    expect(a.length).toBe(86 + 3 + 16);
  });
});

describe("buildPushRequest", () => {
  it("posts the encrypted body with the push headers", async () => {
    const keys = await vapidPair();
    const vapid = await importVapidKeys(keys.publicKey, keys.privateKey, "owner@example.com");
    const request = await buildPushRequest(sub, RFC.plaintext, vapid, now, await rfcOverrides());

    expect(request.method).toBe("POST");
    expect(request.url).toBe(sub.endpoint);
    expect(request.headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(request.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(request.headers.get("TTL")).toBe(String(PUSH_TTL));
    expect(PUSH_TTL).toBe(14400);
    expect(request.headers.get("Urgency")).toBe("normal");
    expect(request.redirect).toBe("manual");
    expect(base64UrlEncode(new Uint8Array(await request.arrayBuffer()))).toBe(RFC.body);
  });

  it("signs a VAPID JWT for the endpoint origin that verifies with the public key", async () => {
    const keys = await vapidPair();
    const vapid = await importVapidKeys(keys.publicKey, keys.privateKey, "owner@example.com");
    const request = await buildPushRequest(sub, "x", vapid, now);

    const match = /^vapid t=([^,]+), k=(.+)$/.exec(request.headers.get("Authorization") ?? "");
    expect(match).not.toBeNull();
    const [, token, k] = match ?? [];
    expect(k).toBe(keys.publicKey);

    const [header, claims, signature] = token.split(".");
    expect(decodeJson(header)).toEqual({ typ: "JWT", alg: "ES256" });
    expect(decodeJson(claims)).toEqual({
      aud: "https://push.example.com",
      exp: now.getTime() / 1000 + 12 * 60 * 60,
      sub: "mailto:owner@example.com",
    });
    const signatureBytes = base64UrlDecode(signature);
    expect(signatureBytes.length).toBe(64);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      keys.verifyKey,
      signatureBytes,
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it("signs one JWT per push-service origin", async () => {
    const keys = await vapidPair();
    const vapid = await importVapidKeys(keys.publicKey, keys.privateKey, "owner@example.com");
    const token = async (endpoint: string) =>
      (await buildPushRequest({ ...sub, endpoint }, "x", vapid, now)).headers.get("Authorization");

    const first = await token("https://push.example.com/a");
    expect(await token("https://push.example.com/b")).toBe(first);
    expect(await token("https://other.example.net/a")).not.toBe(first);
    expect(vapid.tokens.size).toBe(2);
  });

  it("rejects a malformed key", async () => {
    await expect(importVapidKeys("AAAA", "AAAA", "owner@example.com")).rejects.toThrow(/uncompressed/);
  });
});
