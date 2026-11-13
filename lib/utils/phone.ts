// Маска телефона +7: храним и показываем в формате +7 (XXX) XXX-XX-XX.
// Только отображение — SMS-верификации нет (решение владельца). Ведущая 8
// нормализуется к +7, дальше — не больше 10 цифр после кода страны.
export function formatPhoneMask(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (digits.startsWith('7')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 8);
  const p4 = digits.slice(8, 10);
  let out = '+7';
  if (p1) out += ` (${p1}`;
  if (p1.length === 3) out += ')';
  if (p2) out += ` ${p2}`;
  if (p3) out += `-${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}
