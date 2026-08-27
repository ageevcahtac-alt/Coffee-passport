export function DescriptorTags({ descriptors }: { descriptors: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {descriptors.map((descriptor) => (
        <li
          key={descriptor}
          className="rounded-full border border-ink-200 bg-parchment-100 px-3 py-1.5
                     text-xs text-ink-700 font-body"
        >
          {descriptor}
        </li>
      ))}
    </ul>
  );
}
