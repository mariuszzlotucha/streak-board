// Web Push with WebCrypto only, so it runs natively on Workers: the VAPID JWT (RFC 8292) and the aes128gcm payload
// encryption (RFC 8291 over the RFC 8188 header). No key, endpoint or payload is ever logged here.

/** A stored subscription as `due_reminders` returns it; the keys are base64url as the browser exports them. */
export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The application server's keys, imported once per run; `tokens` caches one JWT per push-service origin. */
export interface VapidKeys {
  /** base64url, the 65-byte uncompressed P-256 point (the `k=` of the Authorization header). */
  publicKey: string;
  privateKey: CryptoKey;
  /** `mailto:` + the contact address. */
  subject: string;
  tokens: Map<string, Promise<string>>;
}

/** Test-only seam: the RFC 8291 vector fixes the server's ephemeral key pair and the salt. */
export interface EncryptionOverrides {
  serverKeys?: { privateKey: CryptoKey; publicKey: Uint8Array };
  salt?: Uint8Array;
}

/** Seconds the push service keeps an undelivered message: 4 h, so a 20:00 reminder expires around midnight. */
export const PUSH_TTL = 14400;
/** VAPID allows at most 24 h; 12 h is the usual ceiling. */
const JWT_LIFETIME_SECONDS = 12 * 60 * 60;
const RECORD_SIZE = 4096;

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** The JWK of a P-256 private key from the raw scalar and the uncompressed public point. */
function privateJwk(d: Uint8Array, publicPoint: Uint8Array): JsonWebKey {
  if (publicPoint.length !== 65 || publicPoint[0] !== 4)
    throw new Error("public key is not an uncompressed P-256 point");
  if (d.length !== 32) throw new Error("private key is not a 32-byte P-256 scalar");
  return {
    kty: "EC",
    crv: "P-256",
    d: base64UrlEncode(d),
    x: base64UrlEncode(publicPoint.slice(1, 33)),
    y: base64UrlEncode(publicPoint.slice(33, 65)),
    ext: false,
  };
}

/** Imports a base64url private scalar for ECDH (the RFC 8291 test vector's server key). */
export function importEcdhPrivateKey(privateKey: string, publicKey: string): Promise<CryptoKey> {
  const jwk = privateJwk(base64UrlDecode(privateKey), base64UrlDecode(publicKey));
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

/** Imports the VAPID key pair once per run. */
export async function importVapidKeys(publicKey: string, privateKey: string, contactEmail: string): Promise<VapidKeys> {
  const jwk = privateJwk(base64UrlDecode(privateKey), base64UrlDecode(publicKey));
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { publicKey, privateKey: key, subject: `mailto:${contactEmail}`, tokens: new Map() };
}

async function signJwt(vapid: VapidKeys, audience: string, now: Date): Promise<string> {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = {
    aud: audience,
    exp: Math.floor(now.getTime() / 1000) + JWT_LIFETIME_SECONDS,
    sub: vapid.subject,
  };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const input = `${header}.${body}`;
  // WebCrypto returns the raw r||s pair (64 bytes), which is already the JWS ES256 signature format.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    vapid.privateKey,
    encoder.encode(input),
  );
  return `${input}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** The VAPID JWT for an origin, signed once per run and reused for every subscription of that push service. */
export function vapidToken(vapid: VapidKeys, audience: string, now: Date): Promise<string> {
  let token = vapid.tokens.get(audience);
  if (!token) {
    token = signJwt(vapid, audience, now);
    vapid.tokens.set(audience, token);
  }
  return token;
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const imported = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, data));
}

/** RFC 8291 §3.4 encryption into one aes128gcm record, with the RFC 8188 header (salt, rs, idlen, keyid). */
export async function encryptPayload(
  sub: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  payload: string,
  overrides: EncryptionOverrides = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = base64UrlDecode(sub.p256dh);
  const authSecret = base64UrlDecode(sub.auth);
  const salt = overrides.salt ? new Uint8Array(overrides.salt) : crypto.getRandomValues(new Uint8Array(16));

  let serverPrivate: CryptoKey;
  let asPublic: Uint8Array<ArrayBuffer>;
  if (overrides.serverKeys) {
    serverPrivate = overrides.serverKeys.privateKey;
    asPublic = new Uint8Array(overrides.serverKeys.publicKey);
  } else {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    serverPrivate = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  }

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, serverPrivate, 256),
  );

  // HKDF-SHA-256 with a single 32-byte block each time, written out as HMAC steps as in RFC 8291 §3.4.
  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hmac(prkKey, concat(keyInfo, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(encoder.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(
    0,
    16,
  );
  const nonce = (await hmac(prk, concat(encoder.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(
    0,
    12,
  );

  // A single record: the plaintext, then the 0x02 last-record padding delimiter.
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

/** One push request to the subscription's endpoint: encrypted body, VAPID authorization, 4 h TTL. */
export async function buildPushRequest(
  sub: PushSubscriptionKeys,
  payload: string,
  vapid: VapidKeys,
  now: Date,
  overrides: EncryptionOverrides = {},
): Promise<Request> {
  const audience = new URL(sub.endpoint).origin;
  const [token, body] = await Promise.all([vapidToken(vapid, audience, now), encryptPayload(sub, payload, overrides)]);
  return new Request(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${vapid.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(PUSH_TTL),
      Urgency: "normal",
    },
    body,
  });
}
