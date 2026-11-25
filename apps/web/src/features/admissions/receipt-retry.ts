/** Persist only hashes/opaque idempotency keys, never file bytes or payment fields. */
export function paymentRetry(ownerId: string, digest: string, storage: Storage) {
  if (!ownerId || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('INVALID_RETRY_SCOPE');
  const slot = `smart-english:payment-retry:${ownerId}:${digest}`;
  let old: string | null;
  try {
    old = storage.getItem(slot);
  } catch {
    throw new Error('RETRY_STORAGE_UNAVAILABLE');
  }
  if (old && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(old))
    throw new Error('INVALID_RETRY_KEY');
  const key = old ?? crypto.randomUUID();
  // Fail before uploading if safe reload recovery storage cannot be established.
  try {
    storage.setItem(slot, key);
    if (storage.getItem(slot) !== key) throw new Error('readback');
  } catch {
    throw new Error('RETRY_STORAGE_UNAVAILABLE');
  }
  return { key, existing: !!old, acknowledge: () => storage.removeItem(slot) };
}
