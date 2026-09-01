'use client';

import type { CheckinReplyRow, CheckinReplyInsert } from '@/lib/types/database';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { generateId } from '@/lib/utils/id';

// Coffee-shop/roaster replies to a guest's checkin (components/shared/
// ReviewReplyThread.tsx) — public.checkin_replies (see
// supabase/migrations/0011_checkin_replies.sql), replacing the old
// localStorage-only lib/data/reviewRepliesStore.ts. No local cache: this
// is a small, per-thread read (one checkin at a time), unlike
// journey/store.ts's whole-history cache.

export type ResponderType = 'coffee_shop' | 'roaster';

export interface ReviewReply {
  id: string;
  tastingRecordId: string;
  responderType: ResponderType;
  responderId: string; // coffeeShopId or roasterId
  responderName: string; // display label, e.g. shop/roaster name
  message: string;
  createdAt: string; // ISO timestamp
}

function rowToReply(row: CheckinReplyRow): ReviewReply {
  return {
    id: row.id,
    tastingRecordId: row.checkin_id,
    responderType: row.responder_type,
    responderId: row.responder_id,
    responderName: row.responder_name,
    message: row.message,
    createdAt: row.created_at,
  };
}

// Best-effort, same as every other Supabase read in this app: an error
// here (RLS reject, offline, migration not applied yet) just means an
// empty thread — ReviewReplyThread already renders its own empty state.
export async function fetchRepliesForCheckin(checkinId: string): Promise<ReviewReply[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('checkin_replies')
      .select('*')
      .eq('checkin_id', checkinId)
      .order('created_at', { ascending: true });
    if (error || !data) return [];
    return (data as CheckinReplyRow[]).map(rowToReply);
  } catch {
    return [];
  }
}

// Same write-through pattern as lib/journey/store.ts's addTastingRecord:
// id/createdAt generated client-side so the reply shows up in the thread
// immediately, the Supabase write fires in the background, best-effort —
// a failed write (offline, RLS reject) just won't show up for anyone else
// once the page reloads.
export function addReviewReply(input: Omit<ReviewReply, 'id' | 'createdAt'>): ReviewReply {
  const reply: ReviewReply = {
    ...input,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  const insert: CheckinReplyInsert = {
    id: reply.id,
    checkin_id: reply.tastingRecordId,
    responder_type: reply.responderType,
    responder_id: reply.responderId,
    responder_name: reply.responderName,
    message: reply.message,
    created_at: reply.createdAt,
  };

  void getBrowserSupabaseClient()
    .from('checkin_replies')
    .insert(insert)
    .then(({ error }) => {
      if (error) {
        console.warn('[checkin_replies] Supabase write failed, kept local-only:', error.message);
      }
    });

  return reply;
}
