'use client';

import type { EventRow } from '@/lib/types/database';
import type { CoffeeEvent, EventStatus } from '@/lib/types/coffee';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { generateId } from '@/lib/utils/id';

// Admin-facing CRUD for /dashboard/admin/events — direct Supabase calls
// gated by the "admin manages all events" RLS policy (see
// supabase/migrations/0014_events_module.sql), same pattern as the cafe
// dashboard's shop_ranks editor (lib/data/loyalty.ts). The public board
// itself never imports this file — it reads through /api/events instead.

function rowToEvent(row: EventRow): CoffeeEvent {
  return {
    id: row.id,
    title: row.title,
    location: row.location,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    link: row.link,
    status: row.status,
    source: row.source,
  };
}

export async function fetchAllEvents(): Promise<CoffeeEvent[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('start_date', { ascending: true });
    if (error || !data) return [];
    return data.map(rowToEvent);
  } catch {
    return [];
  }
}

export type EventFormValues = Omit<CoffeeEvent, 'id' | 'status' | 'source'>;

export async function saveEvent(
  event: EventFormValues & { id?: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const fields = {
      title: event.title,
      location: event.location,
      description: event.description,
      start_date: event.startDate,
      end_date: event.endDate,
      link: event.link,
    };

    const now = new Date().toISOString();
    const { error } = event.id
      ? await supabase.from('events').update({ ...fields, updated_at: now }).eq('id', event.id)
      : await supabase.from('events').insert({
          ...fields,
          id: generateId(),
          status: 'active',
          source: 'manual',
          created_at: now,
          updated_at: now,
        });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function setEventStatus(id: string, status: EventStatus): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { error } = await supabase.from('events').update({ status }).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function deleteEvent(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}
