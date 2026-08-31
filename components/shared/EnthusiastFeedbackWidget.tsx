'use client';

import { useCurrentUser } from '@/lib/auth/currentUser';
import { FeedbackWidget } from './FeedbackWidget';

// Mounted on the enthusiast's own cabinet (/journey) — unlike the staff
// dashboards, this role can be a signed-in account OR an anonymous
// per-browser device id (see lib/auth/currentUser.tsx). platform_feedback
// only accepts inserts where owner_user_id = auth.uid(), so an anonymous
// guest can open the dialog but submit is disabled with an explanatory
// note until they actually sign in.
export function EnthusiastFeedbackWidget() {
  const { userId, isAuthenticated, ready } = useCurrentUser();
  if (!ready) return null;
  return <FeedbackWidget userId={userId} role="enthusiast" isAuthenticated={isAuthenticated} />;
}
