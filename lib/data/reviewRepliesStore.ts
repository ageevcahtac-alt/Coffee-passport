'use client';

// Coffee-shop/roaster replies to a guest's tasting record. Same no-backend
// pattern as lotsStore/cafeStaffStore: local persistence now, shaped to
// drop straight onto public.tasting_note_replies (see
// supabase/migrations/0004_taste_profile.sql) once this flow is wired to
// real auth.

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

const STORAGE_KEY = 'coffee-passport:review-replies';

let cache: ReviewReply[] | null = null;
const listeners = new Set<() => void>();

const EMPTY_REPLIES: ReviewReply[] = [];

function read(): ReviewReply[] {
  if (typeof window === 'undefined') return EMPTY_REPLIES;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as ReviewReply[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(replies: ReviewReply[]) {
  cache = replies;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(replies));
  } catch {
    // Storage unavailable — in-memory cache still reflects the save for
    // the rest of this session.
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): ReviewReply[] {
  return read();
}

export function getServerSnapshot(): ReviewReply[] {
  return EMPTY_REPLIES;
}

export function getRepliesForRecord(tastingRecordId: string): ReviewReply[] {
  return read()
    .filter((reply) => reply.tastingRecordId === tastingRecordId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function addReviewReply(
  input: Omit<ReviewReply, 'id' | 'createdAt'>
): ReviewReply {
  const reply: ReviewReply = {
    ...input,
    id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  write([...read(), reply]);
  return reply;
}
