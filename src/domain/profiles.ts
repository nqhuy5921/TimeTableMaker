import { charCount, checkUniqueName, cleanName, plural, sameName, type NameCheck } from './text';

// Profiles (PF-1, PF-2, SYSTEM_DESIGN §11.1): each one is a whole timetable kept in a
// folder of its own. The main process keeps the list; the rule for names is here.

export interface ProfileEntry {
  id: string;
  name: string;
}

/** The longest name a profile can have, so it fits the header's pill and the list. */
export const PROFILE_NAME_MAX = 60;

/** The name a release 3 timetable gets when it becomes a profile, and the first one's. */
export const FIRST_PROFILE_NAME = 'Timetable';

/** A profile name no other profile has: required, at most 60 characters, case not
    counting and accents counting, as for rooms. `selfId` is the profile being renamed,
    whose own name isn't taken. */
export function checkProfileName(
  profiles: readonly ProfileEntry[],
  input: string,
  selfId: string | null = null,
): NameCheck {
  const check = checkUniqueName(profiles, 'profile', input, selfId);
  if (check.ok && charCount(check.name) > PROFILE_NAME_MAX) {
    return { ok: false, error: `A profile name can be at most ${PROFILE_NAME_MAX} characters.` };
  }
  return check;
}

/** `base`, or `base 2`, `base 3`… if it's taken, cut to fit in 60 characters. */
export function uniqueProfileName(taken: readonly ProfileEntry[], base: string): string {
  const chars = [...cleanName(base)];
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? '' : ` ${n}`;
    const name = cleanName(chars.slice(0, PROFILE_NAME_MAX - suffix.length).join('')) + suffix;
    if (!taken.some((profile) => sameName(profile.name, name))) return name;
  }
}

/** Names as `checkProfileName` would allow them, for a list read from disk that may have
    been edited by hand: cleaned, at most 60 characters, "Profile 3" for an empty one,
    and a number added to a name another profile above it already has. */
export function tidyProfileNames(profiles: readonly ProfileEntry[]): ProfileEntry[] {
  const tidied: ProfileEntry[] = [];
  for (const [i, profile] of profiles.entries()) {
    const base = cleanName(profile.name) || `Profile ${i + 1}`;
    tidied.push({ id: profile.id, name: uniqueProfileName(tidied, base) });
  }
  return tidied;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** When a profile last changed, for the profile screen (PF-2): "Today 14:05",
    "Yesterday 09:12", or "27 Oct 2026", in local time. */
export function lastChangedText(modified: Date, now: Date): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const time = `${pad(modified.getHours())}:${pad(modified.getMinutes())}`;
  if (day(modified) === day(now)) return `Today ${time}`;
  if (day(modified) === yesterday) return `Yesterday ${time}`;
  return `${modified.getDate()} ${MONTHS[modified.getMonth()]} ${modified.getFullYear()}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The delete question's lines (PF-2): what goes with the profile. Counts are null when
    its timetable can't be read. */
export function profileDeletionLines(counts: {
  classes: number | null;
  cards: number | null;
}): string[] {
  const { classes, cards } = counts;
  const has =
    classes === null || cards === null
      ? "Its timetable can't be read, and it's deleted as it is."
      : `It has ${plural(classes, 'class', 'classes')} and ${plural(cards, 'card', 'cards')}.`;
  return [`${has} This can't be undone.`];
}
