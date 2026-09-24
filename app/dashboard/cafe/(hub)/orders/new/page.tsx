'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStaffSession } from '@/lib/auth/staffSession';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { generateId } from '@/lib/utils/id';
import { postJson, useStaffApi } from '@/lib/orders/useStaffApi';
import {
  DESTINATION_TYPE_LABELS,
  MAX_LINE_QUANTITY,
  MAX_ORDER_LINES,
  ROASTERY_PICKUP_LABEL,
  formatMoney,
  formatWeight,
  type CatalogProduct,
  type DestinationType,
} from '@/lib/orders/roasteryOrders';
import { ApiErrorBlock, LoadingBlock } from '@/components/orders/OrdersUi';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

// New order from the existing cafe cabinet to XO COFFEE's roastery.
// Positions come from XO COFFEE's own catalog (Admin — the same products
// and packaging XO Store sells, each tied to a Canonical Lot); prices shown
// here are for orientation only, Admin re-prices every line from its own
// data. The shop and the destination label are fixed server-side from the
// signed-in account.

interface CartLine {
  variantId: string;
  productName: string;
  passportPublicId: string | null;
  weightGrams: number;
  price: number;
  quantity: number;
}

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

export default function NewRoasteryOrderPage() {
  const router = useRouter();
  const { cafeId } = useStaffSession();
  const shop = cafeId ? getCoffeeShopById(cafeId) : undefined;
  const catalog = useStaffApi<CatalogProduct[]>('/api/cafe/roastery-orders/catalog');

  const [cart, setCart] = useState<CartLine[]>([]);
  const [destinationType, setDestinationType] = useState<DestinationType>('coffee_shop');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Prefill the delivery address from the shop's own map profile once.
  const addressPrefilled = useRef(false);
  useEffect(() => {
    if (!addressPrefilled.current && shop?.address) {
      addressPrefilled.current = true;
      setAddress(shop.address);
    }
  }, [shop?.address]);

  // One idempotency key per exact draft: resubmitting the same draft (double
  // click, retry after a timeout) can never create a second order, while any
  // edit to the draft gets a fresh key so it can never be answered with an
  // older order.
  const idempotencyKey = useRef(generateId());
  useEffect(() => {
    idempotencyKey.current = generateId();
  }, [cart, destinationType, address, contact]);

  const total = useMemo(() => cart.reduce((sum, line) => sum + line.price * line.quantity, 0), [cart]);
  const units = cart.reduce((sum, line) => sum + line.quantity, 0);

  function addLine(product: CatalogProduct, variantId: string, quantity: number) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant) return;
    setCart((current) => {
      const existing = current.find((line) => line.variantId === variantId);
      if (existing) {
        return current.map((line) =>
          line.variantId === variantId
            ? { ...line, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity + quantity) }
            : line
        );
      }
      if (current.length >= MAX_ORDER_LINES) return current;
      return [
        ...current,
        {
          variantId,
          productName: product.name,
          passportPublicId: product.passport_public_id,
          weightGrams: variant.weight_grams,
          price: Number(variant.price),
          quantity,
        },
      ];
    });
  }

  function setLineQuantity(variantId: string, quantity: number) {
    setCart((current) =>
      current.map((line) =>
        line.variantId === variantId ? { ...line, quantity: Math.max(1, Math.min(MAX_LINE_QUANTITY, quantity)) } : line
      )
    );
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    const result = await postJson<{ orderId: string }>('/api/cafe/roastery-orders', {
      idempotency_key: idempotencyKey.current,
      destination_type: destinationType,
      address: destinationType === 'coffee_shop' ? address : null,
      contact,
      items: cart.map((line) => ({ variant_id: line.variantId, quantity: line.quantity })),
    });
    if (result.ok) {
      router.push('/dashboard/cafe/orders');
      return;
    }
    setSubmitting(false);
    setSubmitError(
      result.error.kind === 'unavailable'
        ? `${result.error.message} Повторная отправка безопасна — заказ не задвоится.`
        : result.error.message
    );
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-8">
        <p className="section-label flex-1">Новый заказ в ростерию</p>
        <Link href="/dashboard/cafe/orders" className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 shrink-0">
          ← Все заказы
        </Link>
      </div>

      <section aria-label="Каталог" className="mb-10">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-3">1 · Кофе и фасовка</p>
        {catalog.status === 'loading' ? <LoadingBlock label="Загружаем каталог XO COFFEE…" /> : null}
        {catalog.status === 'error' ? (
          <ApiErrorBlock error={catalog.error} onRetry={catalog.reload} nextPath="/dashboard/cafe/orders/new" />
        ) : null}
        {catalog.status === 'ready' && catalog.data.length === 0 ? (
          <p className="text-sm text-ink-500">Сейчас в каталоге XO COFFEE нет позиций для заказа.</p>
        ) : null}
        {catalog.status === 'ready' && catalog.data.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {catalog.data.map((product) => (
              <ProductCard key={product.id} product={product} onAdd={addLine} />
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-label="Состав заказа" className="mb-10">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-3">2 · Состав заказа</p>
        {cart.length === 0 ? (
          <p className="text-sm text-ink-500">Пока пусто — добавьте позиции из каталога выше.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-ink-100 rounded-md border border-ink-200 bg-parchment-50">
            {cart.map((line) => (
              <li key={line.variantId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-[10rem]">
                  <p className="text-sm text-ink-900">
                    {line.productName} · {formatWeight(line.weightGrams)}
                  </p>
                  <p className="text-xs text-ink-400">
                    {line.passportPublicId ?? '—'} · {formatMoney(line.price)} / уп.
                  </p>
                </div>
                <QuantityStepper
                  value={line.quantity}
                  onChange={(value) => setLineQuantity(line.variantId, value)}
                  label={`Количество: ${line.productName} ${formatWeight(line.weightGrams)}`}
                />
                <button
                  type="button"
                  onClick={() => setCart((current) => current.filter((l) => l.variantId !== line.variantId))}
                  className="text-xs text-ink-400 underline underline-offset-2 hover:text-ink-900"
                >
                  Убрать
                </button>
              </li>
            ))}
            <li className="flex justify-between px-4 py-3 text-sm">
              <span className="text-ink-500">Итого: {units} уп.</span>
              <span className="data-value text-ink-900">{formatMoney(total)}</span>
            </li>
          </ul>
        )}
      </section>

      <section aria-label="Получение" className="mb-10">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-3">3 · Получение</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4" role="radiogroup" aria-label="Способ получения">
          {(['coffee_shop', 'roastery_pickup'] as const).map((type) => {
            const checked = destinationType === type;
            return (
              <label
                key={type}
                className={`flex flex-col rounded-md border px-4 py-3 cursor-pointer transition-colors
                            ${checked ? 'border-gold-400 bg-parchment-50' : 'border-ink-200 hover:border-ink-400'}`}
              >
                <input
                  type="radio"
                  name="destination"
                  value={type}
                  checked={checked}
                  onChange={() => setDestinationType(type)}
                  className="sr-only"
                />
                <span className="text-sm text-ink-900">{DESTINATION_TYPE_LABELS[type]}</span>
                <span className="text-xs text-ink-400">
                  {type === 'coffee_shop'
                    ? shop
                      ? `${shop.name} · ${shop.city}`
                      : 'Ваша кофейня'
                    : ROASTERY_PICKUP_LABEL}
                </span>
              </label>
            );
          })}
        </div>
        {destinationType === 'coffee_shop' ? (
          <div className="mb-3">
            <label htmlFor="order-address" className="block text-xs text-ink-400 mb-1.5">
              Адрес доставки
            </label>
            <input
              id="order-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={300}
              placeholder="Город, улица, дом"
              className={fieldClasses}
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="order-contact" className="block text-xs text-ink-400 mb-1.5">
            Контакт для связи (необязательно)
          </label>
          <input
            id="order-contact"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            maxLength={200}
            placeholder="Имя, телефон"
            className={fieldClasses}
          />
        </div>
      </section>

      <button
        type="button"
        disabled={cart.length === 0 || (destinationType === 'coffee_shop' && address.trim() === '')}
        onClick={() => {
          setSubmitError(null);
          setReviewOpen(true);
        }}
        className="w-full sm:w-auto inline-flex items-center justify-center rounded-md bg-ink-900
                   text-parchment-100 font-body font-medium text-sm px-6 py-3
                   hover:bg-ink-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Проверить заказ
      </button>
      {destinationType === 'coffee_shop' && address.trim() === '' && cart.length > 0 ? (
        <p className="text-xs text-ink-400 mt-2">Укажите адрес доставки или выберите самовывоз.</p>
      ) : null}

      {reviewOpen ? (
        <ConfirmDialog
          title="Проверьте заказ"
          confirmLabel="Отправить в XO COFFEE"
          busy={submitting}
          error={submitError}
          onConfirm={() => void submit()}
          onClose={() => setReviewOpen(false)}
        >
          <ul className="flex flex-col gap-1">
            {cart.map((line) => (
              <li key={line.variantId} className="flex justify-between gap-3">
                <span>
                  {line.productName} · {formatWeight(line.weightGrams)}
                </span>
                <span className="data-value text-ink-900">× {line.quantity}</span>
              </li>
            ))}
          </ul>
          <p>
            <span className="text-ink-400">Получение: </span>
            {DESTINATION_TYPE_LABELS[destinationType]}
            {destinationType === 'coffee_shop' ? ` · ${address}` : ` · ${ROASTERY_PICKUP_LABEL}`}
          </p>
          <p>
            <span className="text-ink-400">Ориентировочно: </span>
            <span className="data-value text-ink-900">{formatMoney(total)}</span>
            <span className="block text-xs text-ink-400">Итоговую сумму фиксирует XO COFFEE по своему прайсу.</span>
          </p>
          <p className="text-xs text-ink-400">
            После отправки XO COFFEE подтвердит заказ, и он попадёт в производство ростерии.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function ProductCard({
  product,
  onAdd,
}: {
  product: CatalogProduct;
  onAdd: (product: CatalogProduct, variantId: string, quantity: number) => void;
}) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const variant = product.variants.find((v) => v.id === variantId);

  return (
    <li className="rounded-md border border-ink-200 bg-parchment-50 px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <p className="font-display text-lg text-ink-900">{product.name}</p>
        {product.passport_public_id ? (
          <Link
            href={`/passport/${encodeURIComponent(product.passport_public_id)}`}
            className="text-[11px] text-ink-400 underline underline-offset-2 hover:text-ink-900"
          >
            Паспорт лота {product.passport_public_id}
          </Link>
        ) : null}
      </div>
      {product.description ? <p className="text-sm text-ink-500 mb-3">{product.description}</p> : null}

      <div className="flex flex-wrap gap-2 mb-3" role="radiogroup" aria-label={`Фасовка: ${product.name}`}>
        {product.variants.map((option) => {
          const checked = option.id === variantId;
          return (
            <label
              key={option.id}
              className={`rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors
                          ${checked ? 'border-gold-400 bg-parchment-100 text-ink-900' : 'border-ink-200 text-ink-600 hover:border-ink-400'}`}
            >
              <input
                type="radio"
                name={`variant-${product.id}`}
                value={option.id}
                checked={checked}
                onChange={() => setVariantId(option.id)}
                className="sr-only"
              />
              {formatWeight(option.weight_grams)} · <span className="data-value">{formatMoney(option.price)}</span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper value={quantity} onChange={setQuantity} label={`Количество: ${product.name}`} />
        <button
          type="button"
          disabled={!variant}
          onClick={() => {
            onAdd(product, variantId, quantity);
            setQuantity(1);
            setAdded(true);
            window.setTimeout(() => setAdded(false), 1500);
          }}
          className="inline-flex items-center justify-center rounded-md border border-ink-900 px-4 py-2.5
                     text-sm font-body text-ink-900 hover:bg-ink-900 hover:text-parchment-100 transition-colors
                     disabled:opacity-40"
        >
          {added ? 'Добавлено ✓' : 'В заказ'}
        </button>
      </div>
    </li>
  );
}

function QuantityStepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const clamp = (n: number) => Math.max(1, Math.min(MAX_LINE_QUANTITY, Number.isFinite(n) ? Math.trunc(n) : 1));
  return (
    <div className="inline-flex items-stretch rounded-md border border-ink-200 bg-parchment-100">
      <button
        type="button"
        aria-label="Меньше"
        onClick={() => onChange(clamp(value - 1))}
        className="px-3 text-lg text-ink-600 hover:text-ink-900"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_LINE_QUANTITY}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        className="w-16 bg-transparent text-center text-sm data-value text-ink-900 py-2"
      />
      <button
        type="button"
        aria-label="Больше"
        onClick={() => onChange(clamp(value + 1))}
        className="px-3 text-lg text-ink-600 hover:text-ink-900"
      >
        +
      </button>
    </div>
  );
}
