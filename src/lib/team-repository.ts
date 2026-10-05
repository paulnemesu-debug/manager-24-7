/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { supabase } from '@/lib/supabase';

export type WorkspaceMember = {
  id: string;
  invitedEmail: string;
  status: 'pending' | 'active' | 'revoked';
  createdAt: string;
  role: 'manager' | 'head_chef' | 'viewer';
  inviteSentAt?: string | null;
  inviteDelivery?: 'resend' | 'supabase_otp' | 'failed' | null;
};

export type TeamInvitationResult = {
  delivery: 'resend' | 'supabase_otp';
  sentAt: string;
};

function requireClient() {
  if (!supabase) throw new Error('missing-client');
  return supabase;
}

export async function listMembers(): Promise<WorkspaceMember[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('workspace_members')
    .select('id, invited_email, status, created_at, role, invite_sent_at, invite_delivery')
    .neq('status', 'revoked')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    invitedEmail: row.invited_email as string,
    status: row.status as WorkspaceMember['status'],
    createdAt: row.created_at as string,
    role: row.role as WorkspaceMember['role'],
    inviteSentAt: row.invite_sent_at as string | null,
    inviteDelivery: row.invite_delivery as WorkspaceMember['inviteDelivery'],
  }));
}

export async function inviteMember(
  email: string,
  role: WorkspaceMember['role'] = 'viewer',
  locale: 'ro' | 'en' = 'ro',
): Promise<TeamInvitationResult> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke('send-team-invitation', {
    body: { email: email.trim().toLowerCase(), role, locale },
  });
  if (error) throw new Error(data?.error || error.message || 'email_delivery_failed');
  if (!data?.sentAt || !data?.delivery) throw new Error(data?.error || 'email_delivery_failed');
  return { delivery: data.delivery, sentAt: data.sentAt } as TeamInvitationResult;
}

export async function revokeMember(memberId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('workspace_members')
    .update({ status: 'revoked' })
    .eq('id', memberId);
  if (error) throw error;
}
