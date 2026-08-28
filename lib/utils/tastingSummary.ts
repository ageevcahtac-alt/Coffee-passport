import {
  BODY_TEXTURE_OPTIONS,
  FLAVOR_SUB_DESCRIPTORS,
  SENSORY_TAGS,
  type TastingRecord,
} from '@/lib/types/coffee';

// The "стильный текстовый вывод" for a saved tasting — e.g.
// "Кислотность (Апельсин, Яблоко) + Плотное тело" — used on the guest's
// tasting card and anywhere the roaster/cafe needs a quick read of what was
// noted, without walking the raw record shape.
export function summarizeTasting(record: TastingRecord): string {
  const parts: string[] = [];

  for (const tag of SENSORY_TAGS) {
    const subs = record.subDescriptors[tag.id];
    if (subs && subs.length > 0) {
      parts.push(`${tag.label} (${subs.join(', ')})`);
    } else if (record.sensoryTags.includes(tag.id) && !FLAVOR_SUB_DESCRIPTORS[tag.id]) {
      parts.push(tag.label);
    }
  }

  if (record.bodyTexture) {
    const option = BODY_TEXTURE_OPTIONS.find((candidate) => candidate.id === record.bodyTexture);
    if (option) parts.push(option.shortLabel);
  }

  return parts.join(' + ');
}
