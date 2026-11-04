import { describe, expect, it } from 'vitest';
import {
  formatFermentationDays,
  hasProcessPassportContent,
  inferProcessFamily,
  parseFermentationDays,
} from '@/lib/utils/processPassport';
import type { ProcessDetail } from '@/lib/types/coffee';

describe('inferProcessFamily — free-text Lot.process → structured family', () => {
  it('maps english classic processes', () => {
    expect(inferProcessFamily('Washed')).toBe('washed');
    expect(inferProcessFamily('Natural')).toBe('natural');
    expect(inferProcessFamily('Honey')).toBe('honey');
  });

  it('maps russian classic processes', () => {
    expect(inferProcessFamily('Мытая')).toBe('washed');
    expect(inferProcessFamily('Натуральная')).toBe('natural');
    expect(inferProcessFamily('Сухая обработка')).toBe('natural');
    expect(inferProcessFamily('Медовая')).toBe('honey');
  });

  it('maps experimental processes', () => {
    expect(inferProcessFamily('Anaerobic')).toBe('anaerobic');
    expect(inferProcessFamily('Анаэробная')).toBe('anaerobic');
    expect(inferProcessFamily('Анаэробная натуральная')).toBe('anaerobic');
    expect(inferProcessFamily('Co-ferment')).toBe('co-ferment');
    expect(inferProcessFamily('Коферментация с ягодами')).toBe('co-ferment');
  });

  it('prefers the experimental family over the classic one in combined text', () => {
    expect(inferProcessFamily('Washed Anaerobic')).toBe('anaerobic');
    expect(inferProcessFamily('Honey Co-ferment')).toBe('co-ferment');
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(inferProcessFamily('  wAsHeD ')).toBe('washed');
  });

  it('returns null on empty or unrecognized text instead of guessing', () => {
    expect(inferProcessFamily('')).toBeNull();
    expect(inferProcessFamily('   ')).toBeNull();
    expect(inferProcessFamily('Carbonic Maceration')).toBeNull();
    expect(inferProcessFamily('Гибридная обработка')).toBeNull();
  });
});

describe('parseFermentationDays — free-text form input → trustworthy day count', () => {
  it('accepts plain positive integers', () => {
    expect(parseFermentationDays('5')).toBe(5);
    expect(parseFermentationDays('72')).toBe(72);
    expect(parseFermentationDays(' 12 ')).toBe(12);
  });

  it('rejects zero, negatives and non-integers', () => {
    expect(parseFermentationDays('0')).toBeNull();
    expect(parseFermentationDays('-3')).toBeNull();
    expect(parseFermentationDays('2.5')).toBeNull();
  });

  it('rejects anything with units or letters — "didn\'t say", not garbage', () => {
    expect(parseFermentationDays('5 дней')).toBeNull();
    expect(parseFermentationDays('72 ч')).toBeNull();
    expect(parseFermentationDays('abc')).toBeNull();
    expect(parseFermentationDays('')).toBeNull();
  });

  it('rejects absurd magnitudes (a year is a typo, not a process)', () => {
    expect(parseFermentationDays('366')).toBeNull();
    expect(parseFermentationDays('9999')).toBeNull();
  });
});

describe('formatFermentationDays — russian pluralization', () => {
  it('forms the singular and paucal correctly', () => {
    expect(formatFermentationDays(1)).toBe('1 день');
    expect(formatFermentationDays(2)).toBe('2 дня');
    expect(formatFermentationDays(4)).toBe('4 дня');
    expect(formatFermentationDays(5)).toBe('5 дней');
    expect(formatFermentationDays(11)).toBe('11 дней');
    expect(formatFermentationDays(21)).toBe('21 день');
    expect(formatFermentationDays(22)).toBe('22 дня');
    expect(formatFermentationDays(111)).toBe('111 дней');
  });
});

describe('hasProcessPassportContent — the card renders only on real data', () => {
  const filledDetail: ProcessDetail = {
    family: 'anaerobic',
    fermentationDays: 96,
    vessel: 'Герметичная ёмкость',
    roasterNote: 'За яркую кислотность',
  };

  it('true when detail has any content', () => {
    expect(hasProcessPassportContent(filledDetail, [])).toBe(true);
    expect(hasProcessPassportContent({ family: 'washed', fermentationDays: null, vessel: '', roasterNote: '' }, undefined)).toBe(true);
    expect(hasProcessPassportContent({ family: 'other', fermentationDays: null, vessel: '', roasterNote: 'note only' }, undefined)).toBe(true);
  });

  it('true on badges alone', () => {
    expect(hasProcessPassportContent(undefined, ['direct-trade'])).toBe(true);
    expect(hasProcessPassportContent(undefined, ['direct-trade', 'regenerative'])).toBe(true);
  });

  it('false on empty detail / no badges', () => {
    expect(hasProcessPassportContent(undefined, undefined)).toBe(false);
    expect(hasProcessPassportContent(undefined, [])).toBe(false);
  });

  it('true when only the family is picked — a deliberate roaster selection', () => {
    expect(hasProcessPassportContent({ family: 'other', fermentationDays: null, vessel: '', roasterNote: '' }, [])).toBe(true);
  });
});
