// The "add a new bag" trigger on the "Мой кофе" shelf — same grid cell
// shape as CustomCoffeeCard so it sits naturally among the coffees it
// precedes, styled as an empty slot (dashed border) rather than a solid
// card so it reads as "add here", not as content.
export function AddCustomCoffeeCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full aspect-[4/3] sm:aspect-auto sm:h-full min-h-[220px] rounded-md border-2 border-dashed
                 border-ink-300 bg-parchment-200 flex flex-col items-center justify-center gap-2
                 text-ink-500 hover:border-gold-400 hover:text-ink-900 transition-colors"
    >
      <span className="text-3xl leading-none" aria-hidden="true">
        +
      </span>
      <span className="text-sm font-medium">Добавить зерно</span>
    </button>
  );
}
