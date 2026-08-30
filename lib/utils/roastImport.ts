import type { RoastCurvePoint } from '@/lib/types/coffee';

// Parses roast-log exports from roasting software. Artisan's native .alog
// and Cropster's native export are proprietary/binary-ish formats that
// aren't practical to decode client-side — this instead reads the CSV/JSON
// shape that both (and most other roasting software) CAN export to, sniffing
// common column-name variants so a roaster doesn't have to reformat their
// export by hand.
//
// Pure function — no File/DOM APIs here, so it stays easy to test and reuse
// (e.g. from a future paste-CSV textarea, not just a file upload).

const TIME_ALIASES = ['time', 'time1', 'timestamp', 'seconds', 'elapsed'];
const BT_ALIASES = ['bt', 'beantemp', 'bean temp', 'bean temperature', 'temp2'];
const ET_ALIASES = ['et', 'envtemp', 'env temp', 'environment temp', 'environment temperature', 'temp1'];
const ROR_ALIASES = ['ror', 'rateofrise', 'rate of rise'];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

function matchColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const index = normalized.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

function toNumberOrNull(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveMissingRor(points: RoastCurvePoint[]): { points: RoastCurvePoint[]; derived: boolean } {
  const hasAnyRor = points.some((point) => point.ror !== null);
  if (hasAnyRor) return { points, derived: false };

  const withRor = points.map((point, index) => {
    if (index === 0) return { ...point, ror: 0 };
    const prev = points[index - 1];
    if (point.bt === null || prev.bt === null) return point;
    const deltaTime = point.timeSec - prev.timeSec;
    if (deltaTime <= 0) return point;
    const ror = ((point.bt - prev.bt) / deltaTime) * 60;
    return { ...point, ror: Math.round(ror * 10) / 10 };
  });
  return { points: withRor, derived: true };
}

function parseRoastCsv(text: string): { points: RoastCurvePoint[]; warnings: string[] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { points: [], warnings: ['Файл пуст или содержит только заголовок.'] };

  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const headers = lines[0].split(delimiter).map((header) => header.trim());

  const timeIndex = matchColumn(headers, TIME_ALIASES);
  const btIndex = matchColumn(headers, BT_ALIASES);
  const etIndex = matchColumn(headers, ET_ALIASES);
  const rorIndex = matchColumn(headers, ROR_ALIASES);

  const warnings: string[] = [];
  if (timeIndex === -1) warnings.push('Не найдена колонка времени — использован порядковый номер строки.');
  if (btIndex === -1) warnings.push('Не найдена колонка BT (температура зерна).');
  if (etIndex === -1) warnings.push('Не найдена колонка ET (температура среды).');

  const points: RoastCurvePoint[] = lines.slice(1).map((line, rowIndex) => {
    const cells = line.split(delimiter);
    const timeSec = timeIndex >= 0 ? (toNumberOrNull(cells[timeIndex]) ?? rowIndex) : rowIndex;
    return {
      timeSec,
      bt: btIndex >= 0 ? toNumberOrNull(cells[btIndex]) : null,
      et: etIndex >= 0 ? toNumberOrNull(cells[etIndex]) : null,
      ror: rorIndex >= 0 ? toNumberOrNull(cells[rorIndex]) : null,
    };
  });

  const { points: withRor, derived } = deriveMissingRor(points);
  if (derived) warnings.push('RoR вычислен автоматически из изменения BT.');

  return { points: withRor, warnings };
}

function parseRoastJson(text: string): { points: RoastCurvePoint[]; warnings: string[] } {
  const raw = JSON.parse(text);
  const rawPoints: unknown[] = Array.isArray(raw) ? raw : Array.isArray(raw?.points) ? raw.points : [];

  const points: RoastCurvePoint[] = rawPoints.map((entry, index) => {
    const item = entry as Record<string, unknown>;
    const timeSec = Number(item.timeSec ?? item.time ?? item.t ?? index);
    const bt = item.bt !== undefined ? Number(item.bt) : null;
    const et = item.et !== undefined ? Number(item.et) : null;
    const ror = item.ror !== undefined ? Number(item.ror) : null;
    return {
      timeSec: Number.isFinite(timeSec) ? timeSec : index,
      bt: bt !== null && Number.isFinite(bt) ? bt : null,
      et: et !== null && Number.isFinite(et) ? et : null,
      ror: ror !== null && Number.isFinite(ror) ? ror : null,
    };
  });

  const { points: withRor, derived } = deriveMissingRor(points);
  const warnings: string[] = [];
  if (derived) warnings.push('RoR вычислен автоматически из изменения BT.');
  return { points: withRor, warnings };
}

export function parseRoastFile(text: string, filename: string): { points: RoastCurvePoint[]; warnings: string[] } {
  const looksLikeJson = filename.toLowerCase().endsWith('.json') || text.trim().startsWith('[') || text.trim().startsWith('{');

  if (looksLikeJson) {
    try {
      return parseRoastJson(text);
    } catch {
      return { points: [], warnings: ['Не удалось разобрать файл как JSON.'] };
    }
  }

  return parseRoastCsv(text);
}
