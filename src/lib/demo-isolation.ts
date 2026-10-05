let isolated = false;
export const setInstantDemoIsolation = (enabled: boolean) => { isolated = enabled; };
/** Also protects legacy API calls that do not accept a workspace id. */
export const workspaceFetch: typeof fetch = (input, init) => {
  if (isolated) return Promise.reject(new Error('Demo instant: serviciile conturilor reale sunt dezactivate.'));
  return fetch(input, init);
};
