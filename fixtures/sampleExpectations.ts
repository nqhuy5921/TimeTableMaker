// What the acceptance tests expect of the made-up sample school, which is in
// src/domain/exampleSchool.ts (moved at R5-3, since Download example writes it).

export const SAMPLE_CLASSES = ['6A1', '6A2', '7AA1', '8CE1', '9B1', '9BA1'] as const;

/** Periods placed per class: 2 for a full block, 1 for a half. */
export const SAMPLE_PLACED: Record<(typeof SAMPLE_CLASSES)[number], number> = {
  '6A1': 18,
  '6A2': 8,
  '7AA1': 11,
  '8CE1': 4,
  '9B1': 0,
  '9BA1': 0,
};

/** Every issue the checks find in the sample school, in the checks' order. */
export const SAMPLE_ISSUES = [
  ['error', 'Cô Ngân is in 6A1 and 6A2 at the same time', '6A1, 6A2 · Monday · Periods 3–4'],
  ['error', 'Thầy Tùng has Tuesday off but teaches 1 lesson', '6A1 · Tuesday · Periods 7–8'],
  [
    'error',
    'Thầy Đạt: 4 periods on Wednesday, limit is 3',
    '7AA1 · Wednesday · Periods 7–8 and 9–10',
  ],
  ['error', 'Room P201 has 6A2 and 7AA1 at the same time', '6A2, 7AA1 · Wednesday · Periods 7–8'],
  ['error', "Thầy Đạt can't teach in periods 9–10 on Wednesday", '7AA1 · Wednesday · Periods 9–10'],
  [
    'error',
    'Cô Ngân: 3 free blocks between lessons on Thursday, limit is 2',
    '6A1, 7AA1 · Thursday · Periods 1–2 and 9',
  ],
  [
    'error',
    'Cô Trâm: 2 blocks in a row on Thursday, limit is 1',
    '7AA1, 8CE1 · Thursday · Periods 3–4 and 5–6',
  ],
  [
    'error',
    'Thầy Hiếu: 2 periods of Tin học on Friday, limit is 1',
    '6A1, 7AA1 · Friday · Periods 5–6',
  ],
  ['error', 'Cô Vy teaches on 2 days, limit is 1', '6A1, 6A2 · Whole week'],
  ['error', 'Thầy Đạt: 4 periods this week, limit is 3', '7AA1 · Whole week'],
  ['warning', '7AA1 has KHTN - Lý twice on Wednesday', '7AA1 · Wednesday · Periods 7–8 and 9–10'],
] as const;

/** Each class's errors and warnings: an issue across classes counts in each. */
export const SAMPLE_ISSUE_COUNTS: Record<
  (typeof SAMPLE_CLASSES)[number],
  { errors: number; warnings: number }
> = {
  '6A1': { errors: 5, warnings: 0 },
  '6A2': { errors: 3, warnings: 0 },
  '7AA1': { errors: 7, warnings: 1 },
  '8CE1': { errors: 1, warnings: 0 },
  '9B1': { errors: 0, warnings: 0 },
  '9BA1': { errors: 0, warnings: 0 },
};
