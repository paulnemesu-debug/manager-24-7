/** The browser releases this cross-tab lock if a page closes or crashes. */
export async function withFoodcomCatalogueLock<T>(operation: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error('FOODCOM_BROWSER_UNSUPPORTED');
  return navigator.locks.request('manager247-public-foodcom-v2-mutation', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error('FOODCOM_BUSY');
    return operation();
  });
}
