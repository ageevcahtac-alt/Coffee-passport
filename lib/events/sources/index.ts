import { createIcsSource } from './icsSource';
import type { EventSource } from './types';

// Real, pluggable aggregator sources — configured via env rather than
// hardcoded against one named site. No specific "профильный открытый
// ресурс" was given for this task, and hand-writing an HTML scraper
// against an unverified, unnamed target would be fragile (breaks
// silently on any layout change) and unmaintainable from here. .ics is
// the format built for exactly this kind of syndication and most
// festivals/expos/coffee associations already publish one — an operator
// adds feed URLs via EVENT_SOURCE_ICS_URLS (comma-separated) and
// ingestion starts immediately, no code change required.
function icsSourcesFromEnv(): EventSource[] {
  const raw = process.env.EVENT_SOURCE_ICS_URLS ?? '';
  return raw
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url, index) => createIcsSource(`ics-${index}`, url, url));
}

export function getEventSources(): EventSource[] {
  return icsSourcesFromEnv();
}

export type { EventSource, EventCandidate } from './types';
