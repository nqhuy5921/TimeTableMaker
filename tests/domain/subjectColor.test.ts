import { describe, expect, it } from 'vitest';
import { COLOR_KEYS } from '../../src/domain/model';
import {
  contrastRatio,
  defaultColorKey,
  isHexColor,
  PALETTE_SUBJECTS,
  subjectColorChoice,
  subjectColorFields,
  subjectColors,
} from '../../src/domain/subjectColor';

describe('defaultColorKey', () => {
  it('gives each subject from the layout spec its own palette', () => {
    expect(defaultColorKey('Toán')).toBe('math');
    expect(defaultColorKey('Ngữ văn')).toBe('literature');
    expect(defaultColorKey('KHTN - Lý')).toBe('physics');
    expect(defaultColorKey('Mỹ thuật')).toBe('art');
  });

  it('ignores case, accents, and spacing', () => {
    expect(defaultColorKey('toan')).toBe('math');
    expect(defaultColorKey('KHTN-Hoá')).toBe('chemistry');
    expect(defaultColorKey('  tieng   anh ')).toBe('english');
  });

  it('treats an en dash or em dash like a hyphen', () => {
    expect(defaultColorKey('KHTN – Sinh')).toBe('biology');
    expect(defaultColorKey('KHTN—Lý')).toBe('physics');
  });

  it('matches a bilingual name on its Vietnamese part', () => {
    expect(defaultColorKey('Toán/ Math')).toBe('math');
  });

  it('gives SH lớp and GDPC the same grey', () => {
    expect(defaultColorKey('SH lớp')).toBe('homeroom');
    expect(defaultColorKey('GDPC')).toBe('homeroom');
  });

  it('falls back to the grey for an unknown subject', () => {
    expect(defaultColorKey('Robotics')).toBe('homeroom');
  });
});

describe('subjectColors (SYSTEM_DESIGN §10.5)', () => {
  it('gives the palette, and custom colors over it with the bar taking the text color', () => {
    expect(subjectColors({ colorKey: 'math' })).toEqual({ key: 'math', custom: null });
    expect(subjectColors({ colorKey: 'music', colorSource: 'palette' })).toEqual({
      key: 'music',
      custom: null,
    });
    expect(
      subjectColors({
        colorKey: 'math',
        colorSource: 'custom',
        customColors: { bg: '#ffeedd', ink: '#112233' },
      }),
    ).toEqual({ key: 'math', custom: { bg: '#ffeedd', bar: '#112233', ink: '#112233' } });
  });

  it('gives a missing subject the neutral grey', () => {
    expect(subjectColors(undefined)).toEqual({ key: 'homeroom', custom: null });
  });
});

describe('subjectColorChoice and subjectColorFields (SYSTEM_DESIGN §10.5)', () => {
  it('reads back the choice the fields came from', () => {
    for (const choice of [
      { source: 'name' },
      { source: 'palette', key: 'art' },
      { source: 'custom', bg: '#ffeedd', ink: '#112233' },
    ] as const) {
      expect(subjectColorChoice(subjectColorFields('Toán', choice)!)).toEqual(choice);
    }
  });

  it('keeps the previous palette under custom colors, and lowercases them', () => {
    expect(
      subjectColorFields('Toán', { source: 'custom', bg: '#FFEEDD', ink: '#112233' }, 'art'),
    ).toEqual({
      colorKey: 'art',
      colorSource: 'custom',
      customColors: { bg: '#ffeedd', ink: '#112233' },
    });
  });

  it('gives null for a custom color that is not #rrggbb', () => {
    expect(subjectColorFields('Toán', { source: 'custom', bg: '#fed', ink: '#112233' })).toBeNull();
    expect(isHexColor('#1b3c7a')).toBe(true);
    expect(isHexColor('1b3c7a')).toBe(false);
  });
});

describe('PALETTE_SUBJECTS and contrastRatio', () => {
  it('names every palette by its subject', () => {
    expect(Object.keys(PALETTE_SUBJECTS)).toEqual([...COLOR_KEYS]);
    expect(PALETTE_SUBJECTS.math).toBe('Toán');
    expect(PALETTE_SUBJECTS.homeroom).toBe('SH lớp');
  });

  it('measures contrast as WCAG 2 does, either way round', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1);
    expect(contrastRatio('#e6effc', '#1b3c7a')).toBeGreaterThan(4.5);
  });
});
