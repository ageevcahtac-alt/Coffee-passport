'use client';

import { useState } from 'react';
import { formatTastingDate } from '@/lib/utils/date';
import { addReviewReply, type ResponderType } from '@/lib/data/reviewRepliesStore';
import { useReviewReplies } from '@/lib/data/useReviewReplies';

// Lets a coffee-shop or roaster account reply to one guest tasting record —
// used from both partner cabinets (components/cafe/GuestFeedback.tsx,
// components/roaster/LotGuestAnalytics.tsx), just with a different
// responderType/responderId/responderName per caller.
export function ReviewReplyThread({
  tastingRecordId,
  responderType,
  responderId,
  responderName,
}: {
  tastingRecordId: string;
  responderType: ResponderType;
  responderId: string;
  responderName: string;
}) {
  const allReplies = useReviewReplies();
  const replies = allReplies
    .filter((reply) => reply.tastingRecordId === tastingRecordId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);

  function handleSend() {
    const message = draft.trim();
    if (!message) return;
    addReviewReply({ tastingRecordId, responderType, responderId, responderName, message });
    setDraft('');
    setOpen(false);
  }

  return (
    <div className="mt-3 pt-3 border-t border-ink-100">
      {replies.length > 0 && (
        <div className="flex flex-col gap-2 mb-2">
          {replies.map((reply) => (
            <div key={reply.id} className="rounded-md bg-parchment-200 px-3 py-2">
              <div className="flex items-baseline justify-between gap-3 mb-0.5">
                <p className="text-xs font-medium text-ink-900">↳ {reply.responderName}</p>
                <p className="text-[11px] text-ink-300 shrink-0">{formatTastingDate(reply.createdAt)}</p>
              </div>
              <p className="text-xs text-ink-700">{reply.message}</p>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <div className="flex flex-col gap-2">
          <textarea
            autoFocus
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Ответить от лица «${responderName}»…`}
            className="w-full rounded-md border border-ink-200 bg-parchment-100 px-3 py-2
                       text-xs text-ink-900 placeholder:text-ink-300 focus:border-gold-400"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSend}
              disabled={!draft.trim()}
              className="inline-flex items-center justify-center rounded-md bg-ink-900
                         text-parchment-100 font-body font-medium text-xs px-4 py-2
                         hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Отправить
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setDraft('');
              }}
              className="text-xs text-ink-400 hover:text-ink-700"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
        >
          {replies.length > 0 ? 'Ответить ещё раз' : 'Ответить на отзыв'}
        </button>
      )}
    </div>
  );
}
