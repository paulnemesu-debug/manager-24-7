import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getAllKeys: async () => [...storage.keys()], multiRemove: async (keys: string[]) => { keys.forEach((key) => storage.delete(key)); } } }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, supabase: null }));
import { resetInstantDemo } from './instant-demo';
import { setInstantDemoIsolation, workspaceFetch } from './demo-isolation';
beforeEach(() => { storage.clear(); setInstantDemoIsolation(false); });
afterEach(() => { setInstantDemoIsolation(false); vi.unstubAllGlobals(); });
describe('instant demo isolation', () => {
  it('blocks all cloud requests during demo and restores access on exit', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', request);
    setInstantDemoIsolation(true);
    await expect(workspaceFetch('https://example.invalid/rest/v1/recipes', { method: 'POST' })).rejects.toThrow('Demo instant');
    await expect(workspaceFetch('https://example.invalid/functions/v1/delete-account', { method: 'POST' })).rejects.toThrow('Demo instant');
    expect(request).not.toHaveBeenCalled();
    setInstantDemoIsolation(false);
    await workspaceFetch('https://example.invalid/rest/v1/recipes');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('resets only demo data, including new modules, while retaining accounts and credentials', async () => {
    const demo = ['manager247.operational-documents.v1.demo','manager247.hr-lifecycle.v1.demo','manager247.hr.v1.demo','professional_foodcost.demo_recipes.v2'];
    const keep = ['manager247.operational-documents.v1.real-user','manager247.hr-lifecycle.v1.real-user','sb-auth-token','unrelated.demo'];
    [...demo,...keep].forEach((key) => storage.set(key, 'data'));
    await resetInstantDemo();
    expect([...storage.keys()]).toEqual(keep);
  });
});
