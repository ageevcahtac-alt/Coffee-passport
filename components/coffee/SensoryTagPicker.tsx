import { SENSORY_TAGS, type SensoryTagId } from '@/lib/types/coffee';

export function SensoryTagPicker({
  value,
  onChange,
}: {
  value: SensoryTagId[];
  onChange: (tags: SensoryTagId[]) => void;
}) {
  function toggle(tagId: SensoryTagId) {
    onChange(
      value.includes(tagId) ? value.filter((id) => id !== tagId) : [...value, tagId]
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {SENSORY_TAGS.map((tag) => {
        const checked = value.includes(tag.id);
        return (
          <label
            key={tag.id}
            className={`rounded-full border px-3.5 py-2 text-sm cursor-pointer transition-colors
                        ${checked
                          ? 'border-gold-400 bg-gold-400/10 text-ink-900'
                          : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(tag.id)}
              className="sr-only"
            />
            {tag.label}
          </label>
        );
      })}
    </div>
  );
}
