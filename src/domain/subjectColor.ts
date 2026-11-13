import { COLOR_KEYS, type ColorKey, type Subject } from './model';
import { foldText } from './text';

/** Subject names from the layout spec and the palette each one uses. */
const SUBJECT_COLORS: readonly (readonly [name: string, key: ColorKey])[] = [
  ['Toán', 'math'],
  ['Ngữ văn', 'literature'],
  ['Tiếng Anh', 'english'],
  ['KHTN - Sinh', 'biology'],
  ['KHTN - Hóa', 'chemistry'],
  ['KHTN - Lý', 'physics'],
  ['Lịch sử', 'history'],
  ['Địa lý', 'geography'],
  ['GDCD', 'civics'],
  ['Công nghệ', 'technology'],
  ['Tin học', 'informatics'],
  ['Thể dục', 'pe'],
  ['Âm nhạc', 'music'],
  ['Mỹ thuật', 'art'],
  ['SH lớp', 'homeroom'],
  ['GDPC', 'homeroom'],
];

/** Folds case and accents, collapses spaces, and writes any dash as " - ". Table names
    and looked-up names both go through this, so they always compare alike. */
function normalizeName(name: string): string {
  return foldText(name)
    .replace(/\s*[-\u2013\u2014]\s*/g, ' - ')
    .replace(/\s+/g, ' ');
}

const BY_NAME = new Map(SUBJECT_COLORS.map(([name, key]) => [normalizeName(name), key]));

/** The palette a subject gets from its name. Spacing, case, accents, and the kind of
    dash don't matter, and a bilingual name ("Toán/ Math") matches on its Vietnamese
    part. Unknown subjects get the neutral grey of SH lớp. */
export function defaultColorKey(subjectName: string): ColorKey {
  return (
    BY_NAME.get(normalizeName(subjectName)) ??
    BY_NAME.get(normalizeName(subjectName.split('/')[0] ?? '')) ??
    'homeroom'
  );
}

/** The subject each palette is for, naming its swatch in the subject form, such as
    "Toán's colors" (SYSTEM_DESIGN §10.5). The first name in the table wins. */
export const PALETTE_SUBJECTS: Readonly<Record<ColorKey, string>> = Object.fromEntries(
  COLOR_KEYS.map((key) => [key, SUBJECT_COLORS.find(([, k]) => k === key)?.[0] ?? key]),
) as Record<ColorKey, string>;

/** The subject form's colors (DM-4, SYSTEM_DESIGN §10.5): from the name, a picked palette,
    or custom background and text colors. */
export type SubjectColorChoice =
  | { source: 'name' }
  | { source: 'palette'; key: ColorKey }
  | { source: 'custom'; bg: string; ink: string };

/** The colors a subject shows: its palette, and its custom colors over it when it has
    them. The card's side bar takes the text color, so custom colors need only two. */
export interface SubjectColors {
  key: ColorKey;
  custom: { bg: string; bar: string; ink: string } | null;
}

type SubjectColorFields = Pick<Subject, 'colorKey' | 'colorSource' | 'customColors'>;

/** Every screen reads a subject's colors through this. A missing subject gets the
    neutral grey of SH lớp. */
export function subjectColors(subject: SubjectColorFields | undefined): SubjectColors {
  if (!subject) return { key: 'homeroom', custom: null };
  const custom = subject.colorSource === 'custom' ? subject.customColors : undefined;
  return {
    key: subject.colorKey,
    custom: custom ? { bg: custom.bg, bar: custom.ink, ink: custom.ink } : null,
  };
}

/** The choice a subject's colors come from, for the subject form to start with. */
export function subjectColorChoice(subject: SubjectColorFields): SubjectColorChoice {
  if (subject.colorSource === 'custom' && subject.customColors) {
    return { source: 'custom', ...subject.customColors };
  }
  if (subject.colorSource === 'palette') return { source: 'palette', key: subject.colorKey };
  return { source: 'name' };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** True for a color written as '#rrggbb'. */
export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/** The color fields a subject called `name` gets from a choice. `previousKey` is the
    palette it had, which custom colors keep underneath. From the name leaves out
    `colorSource`, so it follows the name through a rename. Null for a custom color that
    isn't '#rrggbb'. */
export function subjectColorFields(
  name: string,
  choice: SubjectColorChoice,
  previousKey: ColorKey = defaultColorKey(name),
): SubjectColorFields | null {
  switch (choice.source) {
    case 'name':
      return { colorKey: defaultColorKey(name) };
    case 'palette':
      return { colorKey: choice.key, colorSource: 'palette' };
    case 'custom':
      if (!isHexColor(choice.bg) || !isHexColor(choice.ink)) return null;
      return {
        colorKey: previousKey,
        colorSource: 'custom',
        customColors: { bg: choice.bg.toLowerCase(), ink: choice.ink.toLowerCase() },
      };
  }
}

/** The color fields the subject form gives `subject` (undefined when adding one) under
    `name`. A subject whose colors already come from its name keeps the palette it has while
    the name stays the same, so an unchanged form changes nothing and its preview shows the
    colors on screen, even when the stored palette isn't the name's (a hand-edited file, or
    one saved before the name table changed). */
export function formColorFields(
  subject: (SubjectColorFields & Pick<Subject, 'name'>) | undefined,
  name: string,
  choice: SubjectColorChoice,
): SubjectColorFields | null {
  if (subject?.colorSource === undefined && choice.source === 'name' && name === subject?.name) {
    return { colorKey: subject.colorKey };
  }
  return subjectColorFields(name, choice, subject?.colorKey);
}

/** A '#rrggbb' color's relative luminance (WCAG 2). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast between two '#rrggbb' colors (WCAG 2), from 1 to 21. Under 4.5 the
    subject form says custom text is hard to read. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The lowest contrast custom text reads well at (WCAG AA for body text). */
export const READABLE_CONTRAST = 4.5;
