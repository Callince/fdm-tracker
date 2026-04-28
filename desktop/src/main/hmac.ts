/**
 * Builds the X-Device-Signature header for signed endpoints.
 * Format matches the server in backend/app/hmac_verify.py.
 */
import crypto from "node:crypto";

export function signRequest(
  secret: string,
  method: string,
  path: string,
  body: string,
): { header: string; t: number } {
  const t = Math.floor(Date.now() / 1000);
  const bodyHash = crypto.createHash("sha256").update(body, "utf8").digest("hex");
  const signed = `${method.toUpperCase()}\n${path}\n${t}\n${bodyHash}`;
  const mac = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  return { header: `t=${t},v1=${mac}`, t };
}
