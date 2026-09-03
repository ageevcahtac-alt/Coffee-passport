import { BREWING_METHODS, type HomeRecipe } from '@/lib/types/coffee';
import { VoteButtons } from './VoteButtons';

function Row({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  if (!value) return null;
  if (full) {
    return (
      <div className="col-span-2 min-w-0">
        <dt className="text-ink-400 text-xs mb-0.5">{label}</dt>
        <dd className="data-value text-ink-900 break-words">{value}</dd>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <dt className="text-ink-400 shrink-0">{label}</dt>
      <dd className="data-value text-ink-900 text-right truncate">{value}</dd>
    </div>
  );
}

// Renders one HomeRecipe (see lib/types/coffee.ts) either as the owner's own
// editable card (Home Brew Lab, /my-taste — edit/delete/top/share actions)
// or as a read-only community entry (/recipes — votes only). The 'own'
// action props are simply omitted by the community board rather than this
// component branching on a variant flag, so each caller only ever wires up
// what it actually needs.
export function HomeRecipeCard({
  recipe,
  currentUserId,
  onEdit,
  onDelete,
  onToggleTop,
  onTogglePublic,
}: {
  recipe: HomeRecipe;
  currentUserId: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleTop?: () => void;
  onTogglePublic?: () => void;
}) {
  const method = BREWING_METHODS.find((candidate) => candidate.id === recipe.brewingMethod);
  const ratio = recipe.doseG > 0 && recipe.waterG > 0 ? recipe.waterG / recipe.doseG : null;
  const isOwnView = Boolean(onEdit || onDelete || onToggleTop || onTogglePublic);

  return (
    <div
      className={`rounded-md border bg-parchment-100 p-5 ${
        recipe.isTop ? 'border-gold-400 ring-1 ring-gold-400/40' : 'border-ink-200'
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {recipe.isTop && (
              <span className="rounded-full bg-gold-400 text-ink-900 text-[10px] font-medium uppercase tracking-widest2 px-2 py-0.5">
                ★ Мой топ
              </span>
            )}
            {recipe.isPublic && (
              <span className="rounded-full border border-moss-500 text-moss-500 text-[10px] uppercase tracking-widest2 px-2 py-0.5">
                В сообществе
              </span>
            )}
          </div>
          <h3 className="font-display text-lg text-ink-900 leading-tight truncate">{recipe.title}</h3>
          <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1">
            {method?.label ?? recipe.brewingMethod}
          </p>
        </div>
        {ratio !== null && (
          <span className="data-value text-sm text-gold-500 shrink-0">1:{ratio.toFixed(1)}</span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mb-4">
        <Row label="Доза" value={recipe.doseG > 0 ? `${recipe.doseG} г` : ''} />
        <Row label="Вода" value={recipe.waterG > 0 ? `${recipe.waterG} мл/г` : ''} />
        {recipe.grinderModel && <Row label="Кофемолка" value={recipe.grinderModel} full />}
        {recipe.grindSetting && <Row label="Помол" value={recipe.grindSetting} full />}
        {recipe.waterTempC > 0 && <Row label="Вода, °C" value={`${recipe.waterTempC}°C`} />}
        {recipe.waterMineralization && <Row label="Минерализация" value={recipe.waterMineralization} full />}
        {recipe.preInfusionSec !== null && <Row label="Предсмачивание" value={`${recipe.preInfusionSec} сек`} />}
        {recipe.brewTimeSec !== null && <Row label="Время экстракции" value={`${recipe.brewTimeSec} сек`} />}
      </dl>

      {recipe.notes && <p className="text-sm text-ink-700 leading-relaxed mb-4">{recipe.notes}</p>}

      {isOwnView ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-ink-200">
          {onEdit && (
            <button type="button" onClick={onEdit} className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900">
              Редактировать
            </button>
          )}
          {onToggleTop && (
            <button type="button" onClick={onToggleTop} className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900">
              {recipe.isTop ? 'Убрать из «Моего топа»' : 'Отметить «Мой топ»'}
            </button>
          )}
          {onTogglePublic && (
            <button type="button" onClick={onTogglePublic} className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900">
              {recipe.isPublic ? 'Снять с публикации' : 'Поделиться с сообществом'}
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 ml-auto">
              Удалить
            </button>
          )}
        </div>
      ) : (
        <div className="pt-3 border-t border-ink-200">
          <VoteButtons recipeId={recipe.id} currentUserId={currentUserId} />
        </div>
      )}
    </div>
  );
}
