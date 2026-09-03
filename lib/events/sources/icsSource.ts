import type { EventCandidate, EventSource } from './types';

// Minimal RFC 5545 (iCalendar) reader — just enough of VEVENT's
// SUMMARY/LOCATION/DESCRIPTION/DTSTART/DTEND/URL to populate an
// EventCandidate. Hand-rolled instead of a dependency: the subset needed
// here is small and the format is stable, unlike scraping an arbitrary
// site's HTML (which breaks silently on any redesign and can't be
// verified against a real target from this environment). .ics is also
// the right fit for "профильные открытые ресурсы" in practice — most
// festivals, expos and coffee associations publish a public calendar
// feed for exactly this kind of syndication.

function unfoldIcsLines(raw: string): string[] {
  // RFC 5545 §3.1: a long line is "folded" onto the next physical line,
  // which starts with a single space or tab — undo that before parsing.
  const lines = raw.split(/\r\n|\n|\r/);
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function parseIcsDate(value: string): string | null {
  // Matches both VALUE=DATE (YYYYMMDD) and DATE-TIME (YYYYMMDDTHHMMSSZ).
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

const TRACKED_KEYS = ['SUMMARY', 'LOCATION', 'DESCRIPTION', 'DTSTART', 'DTEND', 'URL'] as const;
type TrackedKey = (typeof TRACKED_KEYS)[number];

export function parseIcsEvents(raw: string): EventCandidate[] {
  const lines = unfoldIcsLines(raw);
  const events: EventCandidate[] = [];
  let current: Partial<Record<TrackedKey, string>> | null = null;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {};
      continue;
    }
    if (line.startsWith('END:VEVENT')) {
      if (current?.SUMMARY && current.DTSTART) {
        const startDate = parseIcsDate(current.DTSTART);
        const endDate = current.DTEND ? parseIcsDate(current.DTEND) : startDate;
        if (startDate) {
          events.push({
            title: unescapeIcsText(current.SUMMARY),
            location: current.LOCATION ? unescapeIcsText(current.LOCATION) : '',
            description: current.DESCRIPTION ? unescapeIcsText(current.DESCRIPTION) : '',
            startDate,
            endDate: endDate ?? startDate,
            link: current.URL?.trim() ?? '',
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    // Strip parameters (e.g. "DTSTART;VALUE=DATE" -> "DTSTART").
    const key = line.slice(0, separatorIndex).split(';')[0].toUpperCase() as TrackedKey;
    if ((TRACKED_KEYS as readonly string[]).includes(key)) {
      current[key] = line.slice(separatorIndex + 1);
    }
  }

  return events;
}

export function createIcsSource(id: string, label: string, url: string): EventSource {
  return {
    id,
    label,
    async fetch() {
      const response = await fetch(url, { headers: { Accept: 'text/calendar' } });
      if (!response.ok) {
        throw new Error(`ICS fetch failed for ${label}: HTTP ${response.status}`);
      }
      const text = await response.text();
      return parseIcsEvents(text);
    },
  };
}
