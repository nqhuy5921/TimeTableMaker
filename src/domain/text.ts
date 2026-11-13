/** A name as it's stored: one Unicode form (so a typed "Toán" and one pasted from Excel
    are the same text), no spaces at the ends, and single spaces inside. */
export function cleanName(input: string): string {
  return input.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Names compare after cleaning and without case, so "toán" and "Toán " clash. Accents
    still count, since they change the word in Vietnamese. Subjects, teachers' short names,
    and rooms all use this. */
export function sameName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

/** A name as `sameName` compares it, for looking names up in a Map. */
export function nameKey(name: string): string {
  return cleanName(name).toLocaleLowerCase('vi');
}

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

/** A name no other item in `items` has, by `sameName`, for the room and subject lists
    ("Enter a room name.", "There's already a room called P101."). `selfId` is the item
    being renamed, whose own name isn't taken. */
export function checkUniqueName(
  items: readonly { id: string; name: string }[],
  noun: string,
  input: string,
  selfId: string | null,
): NameCheck {
  const name = cleanName(input);
  if (name === '') return { ok: false, error: `Enter a ${noun} name.` };
  const twin = items.find((item) => item.id !== selfId && sameName(item.name, name));
  if (twin) return { ok: false, error: `There's already a ${noun} called ${twin.name}.` };
  return { ok: true, name };
}

/** Lower-cases text and drops Vietnamese accents, so "toan" matches "Toán". */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** How many characters text has, as the user counts them: a character outside the Basic
    Multilingual Plane (an emoji, say) is one, not two. Every "at most N characters" rule
    counts with this (R4-8 review). */
export const charCount = (text: string) => [...text].length;

/** "1 period" or "3 periods". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "6A1", "6A1 and 7B1", "6A1, 6A2, and 7B1" (or with "or"). */
export function joinList(items: readonly string[], word: 'and' | 'or'): string {
  if (items.length <= 2) return items.join(` ${word} `);
  return `${items.slice(0, -1).join(', ')}, ${word} ${items[items.length - 1]}`;
}

/** True when `query` appears in `text`, ignoring case and accents. */
export function matchesSearch(text: string, query: string): boolean {
  return foldText(text).includes(foldText(query));
}

/** "F", "AB": a sheet column's letters, where column 1 is "A". */
export function columnLetters(column: number): string {
  let letters = '';
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}
