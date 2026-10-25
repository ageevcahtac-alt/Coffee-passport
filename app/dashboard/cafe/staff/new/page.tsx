import { redirect } from 'next/navigation';

// Staff used to be added as a card saved only in this browser. A new staff
// member is now a real login, created on «Команда» → «+ Добавить сотрудника».
export default function NewStaffPage() {
  redirect('/dashboard/cafe/team?add=1');
}
