import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ single: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: () => ({ update: mocks.update }),
} }));
import { revokeMember } from '@/lib/team-repository';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single });
});
describe('team revocation outcome', () => {
  it('requires the owner-visible row to have been changed', async () => {
    mocks.single.mockResolvedValue({ data: { id: 'member' }, error: null });
    await expect(revokeMember('member')).resolves.toBeUndefined();
    expect(mocks.update).toHaveBeenCalledWith({ status: 'revoked' });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'member');
    expect(mocks.select).toHaveBeenCalledWith('id');
    expect(mocks.single).toHaveBeenCalledOnce();
  });
  it('reports no matching or authorized row instead of silently claiming revocation', async () => {
    const error = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' };
    mocks.single.mockResolvedValue({ data: null, error });
    await expect(revokeMember('unrelated-member')).rejects.toEqual(error);
  });
});
