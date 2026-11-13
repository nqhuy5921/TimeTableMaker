import { describe, expect, it } from 'vitest';
import { charCount, foldText, matchesSearch } from '../../src/domain/text';

describe('matchesSearch', () => {
  it('ignores accents, so "toan" matches "Toán"', () => {
    expect(matchesSearch('Toán', 'toan')).toBe(true);
  });

  it('folds đ to d', () => {
    expect(foldText('Địa lý')).toBe('dia ly');
  });

  it('matches part of a name', () => {
    expect(matchesSearch('KHTN - Hóa', 'hoa')).toBe(true);
    expect(matchesSearch('Ngữ văn', 'toan')).toBe(false);
  });
});

describe('charCount (R4-8 review)', () => {
  it('counts a character outside the Basic Multilingual Plane as one', () => {
    expect(charCount('Toán')).toBe(4);
    expect(charCount('🏫 School')).toBe(8);
  });
});
