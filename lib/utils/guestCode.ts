// Постоянный 5-значный код гостя — человекочитаемый фолбэк к QR (задача 3,
// 2026-11-20, миграция 0051). Код хранится в profiles.guest_code (text,
// unique), генерируется и гарантируется базой (триггер регистрации + unique
// index). Этот модуль — только нормализация ручного ввода баристой: убираем
// пробелы, принимаем ровно 5 цифр. '00123' валиден — код текстовый, ведущие
// нули значимы; поиск идёт по точному совпадению нормализованной строки.
export function normalizeGuestCode(raw: string): string {
  const trimmed = raw.replace(/\s+/g, '');
  if (!/^\d{5}$/.test(trimmed)) return '';
  return trimmed;
}

export function isGuestCodeLike(raw: string): boolean {
  return normalizeGuestCode(raw) !== '';
}
