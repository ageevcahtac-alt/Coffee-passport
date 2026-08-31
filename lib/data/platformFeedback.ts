'use client';

import type { PlatformFeedbackInsert, PlatformFeedbackRow, PlatformFeedbackStatus, ProfileRole } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';

// public.platform_feedback — see supabase/migrations/0009_platform_feedback.sql.
// Insert is open to any authenticated user (their own user_id only);
// read/update is admin-only via RLS, so fetchAllPlatformFeedback() only
// ever returns anything for a signed-in role='admin' session.

export async function submitPlatformFeedback(input: {
  userId: string;
  userRole: ProfileRole;
  feedbackType: PlatformFeedbackInsert['feedback_type'];
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { error } = await supabase.from('platform_feedback').insert({
      user_id: input.userId,
      user_role: input.userRole,
      feedback_type: input.feedbackType,
      message: input.message,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function fetchAllPlatformFeedback(): Promise<PlatformFeedbackRow[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('platform_feedback')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data as PlatformFeedbackRow[];
  } catch {
    return [];
  }
}

export async function updatePlatformFeedbackStatus(
  id: string,
  status: PlatformFeedbackStatus
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { error } = await supabase.from('platform_feedback').update({ status }).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}
