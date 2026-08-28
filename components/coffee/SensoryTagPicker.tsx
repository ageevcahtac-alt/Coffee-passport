'use client';

import { Fragment, useState } from 'react';
import { FLAVOR_SUB_DESCRIPTORS, SENSORY_TAGS, type FlavorSubDescriptors, type SensoryTagId } from '@/lib/types/coffee';

// Categories with a flavor-wheel entry in FLAVOR_SUB_DESCRIPTORS expand
// in place (a full-width row breaks the flex-wrap flow directly under the
// clicked chip) instead of toggling selection directly — their selected
// state is derived from having at least one sub-descriptor picked. Plain
// categories keep the original direct toggle.
export function SensoryTagPicker({
  sensoryTags,
  onSensoryTagsChange,
  subDescriptors,
  onSubDescriptorsChange,
}: {
  sensoryTags: SensoryTagId[];
  onSensoryTagsChange: (tags: SensoryTagId[]) => void;
  subDescriptors: FlavorSubDescriptors;
  onSubDescriptorsChange: (subs: FlavorSubDescriptors) => void;
}) {
  const [expanded, setExpanded] = useState<Set<SensoryTagId>>(new Set());

  function toggleSimpleTag(tagId: SensoryTagId) {
    onSensoryTagsChange(
      sensoryTags.includes(tagId) ? sensoryTags.filter((id) => id !== tagId) : [...sensoryTags, tagId]
    );
  }

  function toggleExpand(tagId: SensoryTagId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  function toggleSubDescriptor(tagId: SensoryTagId, sub: string) {
    const current = subDescriptors[tagId] ?? [];
    const nextForTag = current.includes(sub) ? current.filter((s) => s !== sub) : [...current, sub];

    const nextSubDescriptors = { ...subDescriptors, [tagId]: nextForTag };
    if (nextForTag.length === 0) delete nextSubDescriptors[tagId];
    onSubDescriptorsChange(nextSubDescriptors);

    // Keep the parent tag's membership in sensoryTags in sync with whether
    // it has any sub-descriptor picked, so existing "часто отмечают"-style
    // tallies elsewhere stay meaningful without knowing about sub-lists.
    const hasAny = nextForTag.length > 0;
    const alreadyIncluded = sensoryTags.includes(tagId);
    if (hasAny && !alreadyIncluded) onSensoryTagsChange([...sensoryTags, tagId]);
    if (!hasAny && alreadyIncluded) onSensoryTagsChange(sensoryTags.filter((id) => id !== tagId));
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {SENSORY_TAGS.map((tag) => {
        const subOptions = FLAVOR_SUB_DESCRIPTORS[tag.id];
        const hasSubOptions = Boolean(subOptions);
        const selectedSubs = subDescriptors[tag.id] ?? [];
        const active = hasSubOptions ? selectedSubs.length > 0 : sensoryTags.includes(tag.id);
        const isExpanded = expanded.has(tag.id);

        return (
          <Fragment key={tag.id}>
            <button
              type="button"
              onClick={() => (hasSubOptions ? toggleExpand(tag.id) : toggleSimpleTag(tag.id))}
              aria-expanded={hasSubOptions ? isExpanded : undefined}
              className={`rounded-full border px-3.5 py-2 text-sm transition-colors
                          ${active
                            ? 'border-gold-400 bg-gold-400/10 text-ink-900'
                            : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
            >
              {tag.label}
              {hasSubOptions && (
                <span className="ml-1.5 text-[10px] text-ink-400 align-middle">
                  {isExpanded ? '▲' : '▼'}
                </span>
              )}
              {selectedSubs.length > 0 && (
                <span className="data-value ml-1.5 text-[10px] text-gold-500 align-middle">
                  {selectedSubs.length}
                </span>
              )}
            </button>

            {hasSubOptions && isExpanded && (
              <div className="basis-full flex flex-wrap gap-1.5 pl-3 -mt-0.5 mb-1 reveal-fade">
                {subOptions!.map((sub) => {
                  const subSelected = selectedSubs.includes(sub);
                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => toggleSubDescriptor(tag.id, sub)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition-colors
                                  ${subSelected
                                    ? 'text-ink-900'
                                    : 'border-ink-200 bg-parchment-200 text-ink-500'}`}
                      style={
                        subSelected
                          ? { borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.16)' }
                          : undefined
                      }
                    >
                      {sub}
                    </button>
                  );
                })}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
