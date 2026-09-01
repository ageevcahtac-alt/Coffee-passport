'use client';

import { useEffect, useState } from 'react';
import { fetchRepliesForCheckin, type ReviewReply } from './checkinReplies';

// Fetches this one checkin's reply thread and keeps it in local component
// state — addReply() appends the just-sent reply optimistically (see
// components/shared/ReviewReplyThread.tsx's addReviewReply(), which
// returns the reply immediately rather than waiting on the background
// Supabase write). No cross-component cache needed: each ReviewReplyThread
// is scoped to its own tastingRecordId already.
export function useReviewReplies(tastingRecordId: string): {
  replies: ReviewReply[];
  loading: boolean;
  addReply: (reply: ReviewReply) => void;
} {
  const [replies, setReplies] = useState<ReviewReply[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRepliesForCheckin(tastingRecordId).then((data) => {
      if (cancelled) return;
      setReplies(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tastingRecordId]);

  function addReply(reply: ReviewReply) {
    setReplies((prev) => [...prev, reply]);
  }

  return { replies, loading, addReply };
}
