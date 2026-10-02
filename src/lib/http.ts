/** A `fetch` that asks for `application/json` gets a JSON answer; everything else gets a redirect or a page. */
export function wantsJson(headers: Headers): boolean {
  return (headers.get("Accept") ?? "").toLowerCase().includes("application/json");
}
