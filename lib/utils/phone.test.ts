import { describe, expect, it } from 'vitest';
import { formatPhoneMask } from './phone';

describe('formatPhoneMask', () => {
  it('пустой ввод даёт пустую строку', () => {
    expect(formatPhoneMask('')).toBe('');
    expect(formatPhoneMask('abc')).toBe('');
  });

  it('набирает номер по частям с форматом +7 (XXX) XXX-XX-XX', () => {
    expect(formatPhoneMask('9')).toBe('+7 (9');
    expect(formatPhoneMask('900')).toBe('+7 (900)');
    expect(formatPhoneMask('9001')).toBe('+7 (900) 1');
    expect(formatPhoneMask('900123')).toBe('+7 (900) 123');
    expect(formatPhoneMask('9001234')).toBe('+7 (900) 123-4');
    expect(formatPhoneMask('90012345')).toBe('+7 (900) 123-45');
    expect(formatPhoneMask('9001234567')).toBe('+7 (900) 123-45-67');
  });

  it('принимает уже отформатированную строку и разные разделители', () => {
    expect(formatPhoneMask('+7 (900) 123-45-67')).toBe('+7 (900) 123-45-67');
    expect(formatPhoneMask('8 (900) 123-45-67')).toBe('+7 (900) 123-45-67');
    expect(formatPhoneMask('89001234567')).toBe('+7 (900) 123-45-67');
    expect(formatPhoneMask('+7 900 123 45 67')).toBe('+7 (900) 123-45-67');
  });

  it('обрезает лишние цифры до 10 после кода страны', () => {
    expect(formatPhoneMask('9001234567890')).toBe('+7 (900) 123-45-67');
  });

  it('нормализует ведущую 8 к +7', () => {
    expect(formatPhoneMask('81234567890')).toBe('+7 (123) 456-78-90');
  });
});
