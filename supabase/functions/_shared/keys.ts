// Agent keys: made in the browser, checked by the function, so both sides share the shape and the hash. Web Crypto exists in every runtime here.

export const KEY_PREFIX = "vk_";
/** Characters shown in lists so the owner can tell keys apart. */
export const KEY_SHOWN = 8;

export function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const base64 = btoa(String.fromCharCode(...bytes));
  return KEY_PREFIX + base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
