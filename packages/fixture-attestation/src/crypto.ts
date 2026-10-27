import { createPublicKey, verify } from "node:crypto";

/** Verify an Ed25519 signature with a DER SPKI key; exceptions fail closed. */
export function verifyEd25519(
  der: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(der), type: "spki", format: "der" });
    return (
      key.asymmetricKeyType === "ed25519" &&
      signature.length === 64 &&
      verify(null, message, key, signature)
    );
  } catch {
    return false;
  }
}
