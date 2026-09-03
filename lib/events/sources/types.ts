// One normalized event as read off an external source, before it's
// inserted as a pending_review row (see events_ingest_candidate in
// supabase/migrations/0014_events_module.sql). Dates are plain
// yyyy-mm-dd strings — the DB column is `date`, not `timestamptz`.
export interface EventCandidate {
  title: string;
  location: string;
  description: string;
  startDate: string;
  endDate: string;
  link: string;
}

export interface EventSource {
  id: string; // stored on events.source so admins know where a candidate came from
  label: string;
  fetch(): Promise<EventCandidate[]>;
}
