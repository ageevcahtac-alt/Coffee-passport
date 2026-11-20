import { describe, expect, it } from 'vitest';
import { isGuestCodeLike, normalizeGuestCode } from './guestCode';

// Нормализация ручного ввода 5-значного кода гостя (фолбэк к QR, 0051).
// Код текстовый с ведущими нулями — '00123' валиден и ищется как строка.
describe('normalizeGuestCode', () => {
  it('принимает ровно 5 цифр', () => {
    expect(normalizeGuestCode('12345')).toBe('12345');
    expect(normalizeGuestCode('00123')).toBe('00123');
    expect(normalizeGuestCode('00000')).toBe('00000');
    expect(normalizeGuestCode('99999')).toBe('99999');
  });

  it('сохраняет ведущие нули — код не число', () => {
    expect(normalizeGuestCode('00700')).toBe('00700');
    expect(normalizeGuestCode('00700')).not.toBe('700');
    expect(normalizeGuestCode('01234').length).toBe(5);
  });

  it('сносит пробелы вокруг и внутри ввода', () => {
    expect(normalizeGuestCode(' 12345 ')).toBe('12345');
    expect(normalizeGuestCode('12 345')).toBe('12345');
    expect(normalizeGuestCode('\t00123\n')).toBe('00123');
  });

  it('отклоняет не-5-цифровой ввод пустой строкой', () => {
    expect(normalizeGuestCode('')).toBe('');
    expect(normalizeGuestCode('   ')).toBe('');
    expect(normalizeGuestCode('1234')).toBe('');      // короткий
    expect(normalizeGuestCode('123456')).toBe('');    // длинный
    expect(normalizeGuestCode('12a45')).toBe('');     // буква
    expect(normalizeGuestCode('12-45')).toBe('');     // дефис
    expect(normalizeGuestCode('1234 ')).toBe('');     // пробел не спасает длину
    expect(normalizeGuestCode(' 123 ')).toBe('');
    expect(normalizeGuestCode('-1234')).toBe('');
  });

  it('isGuestCodeLike — фасад для валидации', () => {
    expect(isGuestCodeLike('12345')).toBe(true);
    expect(isGuestCodeLike('00123')).toBe(true);
    expect(isGuestCodeLike('1234')).toBe(false);
    expect(isGuestCodeLike('uuid-формат')).toBe(false);
    expect(isGuestCodeLike('')).toBe(false);
  });
});
