import type { APIRoute } from "astro";
import { securityTxt } from "@/lib/security-txt";
import { contactEmail } from "@/lib/site";

export const prerender = false;

// The build date comes from `vite.define` in astro.config.mjs; Vitest does not inherit it, so the epoch stands in.
const BUILT_AT = new Date(typeof __BUILD_DATE__ !== "undefined" ? __BUILD_DATE__ : 0);

export const GET: APIRoute = () => {
  const contact = contactEmail();
  // Without a contact address there is nothing to publish.
  if (contact === null) return new Response(null, { status: 404 });
  return new Response(securityTxt(contact, BUILT_AT), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
