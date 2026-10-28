/** Shared across duplicate bundles in this JS realm; Web Locks also coordinate browser tabs. */
const shared = globalThis as typeof globalThis & {
  __manager247StorageLocks?: Map<string, Promise<unknown>>;
};
const tails = shared.__manager247StorageLocks ??= new Map<string, Promise<unknown>>();

export function withStorageLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => {
    // Browsers release these locks on tab termination. Native runtimes use the
    // shared promise queue; never emulate an expiring lease around a cloud write.
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    return locks ? locks.request(`manager247.storage.${key}`, work) : work();
  });
  tails.set(key, next);
  void next.finally(() => {
    if (tails.get(key) === next) tails.delete(key);
  }).catch(() => undefined);
  return next;
}
