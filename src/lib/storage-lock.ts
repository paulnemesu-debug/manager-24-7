/** Serialize read-modify-write work by account and module, including cloud acknowledgements. */
const tails = new Map<string, Promise<unknown>>();

export function withStorageLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  tails.set(key, next);
  void next.finally(() => {
    if (tails.get(key) === next) tails.delete(key);
  }).catch(() => undefined);
  return next;
}
