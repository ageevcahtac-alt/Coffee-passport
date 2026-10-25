import { redirect } from 'next/navigation';

// Editing a card saved only in this browser is gone; the card itself is still
// shown on its page and on «Команда».
export default function EditStaffPage({ params }: { params: { id: string } }) {
  redirect(`/dashboard/cafe/staff/${encodeURIComponent(params.id)}`);
}
