'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, type FormEvent } from 'react';
import { getCoffeeShopById, saveCoffeeShop } from '@/lib/data/coffeeShops';
import { useCoffeeShops } from '@/lib/data/useCoffeeShops';
import { useStaffSession } from '@/lib/auth/staffSession';
import { geocodeAddress } from '@/lib/utils/geocode';
import { fileToCompressedDataUrl, isImageFile } from '@/lib/utils/imageFile';
import type { CoffeeShop } from '@/lib/types/coffee';

// Leaflet needs `window` at import time — same reason app/map/page.tsx
// loads CafeMapClient this way.
const CoordinatePicker = dynamic(
  () => import('@/components/map/CoordinatePicker').then((mod) => mod.CoordinatePicker),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-ink-400 text-sm">
        Загрузка карты…
      </div>
    ),
  }
);

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

const MAX_PHOTOS = 3;

interface ProfileFormState {
  name: string;
  city: string;
  address: string;
  phone: string;
  website: string;
  instagramUrl: string;
  telegramUrl: string;
  vkUrl: string;
  description: string;
  workingHours: string;
  photo1: string;
  photo2: string;
  photo3: string;
  lat: number | null;
  lng: number | null;
}

function toFormState(shop: CoffeeShop): ProfileFormState {
  return {
    name: shop.name,
    city: shop.city,
    address: shop.address,
    phone: shop.phone,
    website: shop.website,
    instagramUrl: shop.instagramUrl,
    telegramUrl: shop.telegramUrl,
    vkUrl: shop.vkUrl,
    description: shop.description,
    workingHours: shop.workingHours,
    photo1: shop.photos[0] ?? '',
    photo2: shop.photos[1] ?? '',
    photo3: shop.photos[2] ?? '',
    lat: shop.lat,
    lng: shop.lng,
  };
}

// "Профиль на карте" — everything the /map module (app/map/page.tsx) reads
// for this shop's pin and detail panel. Deliberately owned entirely by the
// coffee shop, not the roaster: per the catalog-separation rule elsewhere
// in this app (see Lot.inRoasterCatalog), a shop's own storefront details
// are the shop's call to make. Saving here writes straight to the same
// coffeeShops store /map reads — no extra sync step, though see that
// store's `storage`-event listener for the cross-TAB case (this dashboard
// open in one tab, /map open in another).
export default function CafeMapProfilePage() {
  const { cafeId } = useStaffSession();
  // useCoffeeShops() only for its subscription — re-renders this page after
  // a save from elsewhere (e.g. the admin partner registry editing this
  // same shop) so the form doesn't silently drift from what /map now shows.
  useCoffeeShops();
  const shop = cafeId ? getCoffeeShopById(cafeId) : undefined;

  const [form, setForm] = useState<ProfileFormState | null>(shop ? toFormState(shop) : null);
  const [saved, setSaved] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [uploadingSlot, setUploadingSlot] = useState<1 | 2 | 3 | null>(null);
  const [uploadError, setUploadError] = useState('');

  // Only re-seed the form from the store on a real shop-id change (staff
  // session switching cafes) — not on every store notification, which
  // would otherwise clobber in-progress edits with the just-saved snapshot
  // right after handleSubmit's own saveCoffeeShop call.
  useEffect(() => {
    if (shop) setForm(toFormState(shop));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed only when the shop id itself changes
  }, [shop?.id]);

  if (!shop || !form) return null;

  function update<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const filledPhotos = [form.photo1, form.photo2, form.photo3].map((p) => p.trim()).filter(Boolean);
  // Photos are optional — a shop's location/coordinates must save even
  // before any photo has been uploaded, per the task's "не блокировать
  // сохранение координат из-за отсутствующего фото" requirement. The form
  // still only ever offers MAX_PHOTOS slots, so the upper bound stays
  // structural (each slot just overwrites itself on re-upload).
  const canSave = true;

  async function handlePhotoFile(slot: 1 | 2 | 3, file: File | null) {
    if (!file) return;
    if (!isImageFile(file)) {
      setUploadError('Выберите файл изображения (JPG, PNG…).');
      return;
    }
    setUploadError('');
    setUploadingSlot(slot);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      update(`photo${slot}` as 'photo1' | 'photo2' | 'photo3', dataUrl);
    } catch {
      setUploadError('Не удалось загрузить это фото — попробуйте другой файл.');
    } finally {
      setUploadingSlot(null);
    }
  }

  async function handleGeocode() {
    const query = [form!.address, form!.city].map((part) => part.trim()).filter(Boolean).join(', ');
    if (!query) {
      setGeocodeError('Сначала укажите адрес и город.');
      return;
    }
    setGeocoding(true);
    setGeocodeError('');
    const result = await geocodeAddress(query);
    setGeocoding(false);
    if (!result) {
      setGeocodeError('Не удалось найти этот адрес на карте — уточните его или поставьте точку вручную.');
      return;
    }
    setForm((prev) => (prev ? { ...prev, lat: result.lat, lng: result.lng } : prev));
    setRecenterSignal((prev) => prev + 1);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!shop || !form || !canSave) return;

    const updated: CoffeeShop = {
      ...shop,
      name: form.name.trim() || shop.name,
      city: form.city.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      website: form.website.trim(),
      instagramUrl: form.instagramUrl.trim(),
      telegramUrl: form.telegramUrl.trim(),
      vkUrl: form.vkUrl.trim(),
      description: form.description.trim(),
      workingHours: form.workingHours.trim(),
      photos: filledPhotos,
      lat: form.lat,
      lng: form.lng,
    };
    saveCoffeeShop(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-10">
      <div>
        <p className="section-label mb-4">Название и город</p>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="profile-name" className="block text-xs text-ink-400 mb-1.5">
              Название кофейни
            </label>
            <input
              id="profile-name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="profile-city" className="block text-xs text-ink-400 mb-1.5">
              Город
            </label>
            <input
              id="profile-city"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              className={fieldClasses}
            />
          </div>
        </div>
      </div>

      <div>
        <p className="section-label mb-4">Точка на карте</p>
        <p className="text-xs text-ink-400 mb-3">
          Кликните по карте, чтобы поставить точку, перетащите метку, или найдите точку по адресу ниже.
        </p>
        <div className="h-72 rounded-md border border-ink-200 overflow-hidden">
          <CoordinatePicker
            lat={form.lat}
            lng={form.lng}
            recenterSignal={recenterSignal}
            onChange={(lat, lng) => setForm((prev) => (prev ? { ...prev, lat, lng } : prev))}
          />
        </div>
        <div className="flex items-center justify-between gap-3 mt-2">
          {form.lat !== null && form.lng !== null ? (
            <p className="text-xs text-ink-400 data-value">
              {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
            </p>
          ) : (
            <p className="text-xs text-ink-400">Точка ещё не установлена</p>
          )}
          <button
            type="button"
            onClick={handleGeocode}
            disabled={geocoding}
            className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900
                       disabled:opacity-40 disabled:pointer-events-none shrink-0"
          >
            {geocoding ? 'Ищем…' : 'Найти на карте по адресу'}
          </button>
        </div>
        {geocodeError && <p className="text-xs text-ink-500 mt-2">⚠ {geocodeError}</p>}
      </div>

      <div>
        <p className="section-label mb-4">Адрес и контакты</p>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="profile-address" className="block text-xs text-ink-400 mb-1.5">
              Адрес
            </label>
            <input
              id="profile-address"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="ул. Примерная, 1"
              className={fieldClasses}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="profile-phone" className="block text-xs text-ink-400 mb-1.5">
                Телефон
              </label>
              <input
                id="profile-phone"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="+7 800 555-01-01"
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="profile-hours" className="block text-xs text-ink-400 mb-1.5">
                Часы работы
              </label>
              <input
                id="profile-hours"
                value={form.workingHours}
                onChange={(e) => update('workingHours', e.target.value)}
                placeholder="Пн–Вс 8:00–20:00"
                className={fieldClasses}
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="section-label mb-4">Соцсети и сайт</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="profile-telegram" className="block text-xs text-ink-400 mb-1.5">
              Telegram
            </label>
            <input
              id="profile-telegram"
              value={form.telegramUrl}
              onChange={(e) => update('telegramUrl', e.target.value)}
              placeholder="https://t.me/…"
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="profile-instagram" className="block text-xs text-ink-400 mb-1.5">
              Instagram
            </label>
            <input
              id="profile-instagram"
              value={form.instagramUrl}
              onChange={(e) => update('instagramUrl', e.target.value)}
              placeholder="https://instagram.com/…"
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="profile-vk" className="block text-xs text-ink-400 mb-1.5">
              VK
            </label>
            <input
              id="profile-vk"
              value={form.vkUrl}
              onChange={(e) => update('vkUrl', e.target.value)}
              placeholder="https://vk.com/…"
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="profile-website" className="block text-xs text-ink-400 mb-1.5">
              Сайт
            </label>
            <input
              id="profile-website"
              value={form.website}
              onChange={(e) => update('website', e.target.value)}
              placeholder="https://…"
              className={fieldClasses}
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="profile-description" className="section-label mb-4 block">
          Философия / описание кофейни
        </label>
        <textarea
          id="profile-description"
          rows={4}
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="Расскажите гостям о кофейне…"
          className={fieldClasses}
        />
      </div>

      <div>
        <p className="section-label mb-1">Фото (до {MAX_PHOTOS}, необязательно)</p>
        <p className="text-xs text-ink-400 mb-4">
          Загрузите фотографии прямо с устройства — профиль можно сохранить и без них.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {([1, 2, 3] as const).map((slot) => {
            const key = `photo${slot}` as const;
            const value = form[key];
            const isUploading = uploadingSlot === slot;
            return (
              <div key={slot} className="flex flex-col gap-2">
                <div className="aspect-square rounded-md border border-ink-200 bg-parchment-200 overflow-hidden flex items-center justify-center">
                  {value ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data: URL / partner-supplied URL, not a Next-optimizable local asset
                    <img src={value} alt={`Фото ${slot}`} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-ink-300">Нет фото</span>
                  )}
                </div>
                <label
                  className="text-center text-xs rounded-md border border-ink-200 px-2 py-2 cursor-pointer
                             text-ink-700 hover:bg-parchment-300 transition-colors
                             aria-disabled:opacity-40 aria-disabled:pointer-events-none"
                  aria-disabled={isUploading}
                >
                  {isUploading ? 'Загрузка…' : value ? 'Заменить' : 'Загрузить'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      void handlePhotoFile(slot, file);
                      e.target.value = '';
                    }}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
                {value && (
                  <button
                    type="button"
                    onClick={() => update(key, '')}
                    className="text-[11px] text-ink-400 underline underline-offset-2 hover:text-ink-700"
                  >
                    Удалить
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {uploadError && <p className="text-xs text-ink-500 mt-3">⚠ {uploadError}</p>}
      </div>

      <button
        type="submit"
        disabled={!canSave}
        className="inline-flex items-center justify-center rounded-md bg-ink-900
                   text-parchment-100 font-body font-medium text-sm px-6 py-4
                   hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
      >
        {saved ? 'Сохранено!' : 'Сохранить профиль на карте'}
      </button>
    </form>
  );
}
