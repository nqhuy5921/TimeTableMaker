import { gradesOf } from '../domain/grades';
import type { TimetableFile } from '../domain/model';
import { timetableFileSchema } from './schema';

// Reading `timetable.json`: parse the JSON, upgrade an older `schemaVersion`, then check
// the result with zod (SYSTEM_DESIGN §4).

export const SCHEMA_VERSION = 6;

type RawFile = Record<string, unknown>;

/** Upgrades a file of one version to the next. Each one sets the new `schemaVersion`. */
export type Migration = (file: RawFile) => RawFile;

/** MIGRATIONS[n] turns a version n file into version n + 1. Version 1 was the first. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // Cards stop belonging to a class (SYSTEM_DESIGN §3a). Cards with the same subject,
  // teacher, and room become the first of them; each placement takes the class of the
  // card it pointed at. A placement whose card is missing gets no `classId`, so the
  // integrity check refuses the file rather than the upgrade guessing.
  1: (file) => {
    const { cards, placements } = file;
    const isRecord = (x: unknown) => typeof x === 'object' && x !== null && !Array.isArray(x);
    if (
      !Array.isArray(cards) ||
      !Array.isArray(placements) ||
      !cards.every(isRecord) ||
      !placements.every(isRecord)
    ) {
      return { ...file, schemaVersion: 2 };
    }

    const kept = new Map<string, RawFile>();
    const keptId = new Map<unknown, unknown>();
    const classOfCard = new Map<unknown, unknown>();
    const pool: RawFile[] = [];
    for (const card of cards as RawFile[]) {
      const { classId, ...rest } = card;
      classOfCard.set(card.id, classId);
      const key = JSON.stringify([card.subjectId, card.teacherId, card.roomId]);
      let first = kept.get(key);
      if (!first) {
        first = rest;
        kept.set(key, first);
        pool.push(first);
      }
      keptId.set(card.id, first.id);
    }
    const moved = (placements as RawFile[]).map((p) =>
      classOfCard.has(p.cardId)
        ? { ...p, cardId: keptId.get(p.cardId), classId: classOfCard.get(p.cardId) }
        : p,
    );
    return { ...file, schemaVersion: 2, cards: pool, placements: moved };
  },
  // Teachers get conditions (SYSTEM_DESIGN §9.1), none to start with. Nothing else
  // changes, so every grid looks the same.
  2: (file) => {
    const { teachers } = file;
    if (!Array.isArray(teachers)) return { ...file, schemaVersion: 3 };
    return {
      ...file,
      schemaVersion: 3,
      teachers: teachers.map((t: unknown) =>
        typeof t === 'object' && t !== null && !Array.isArray(t) ? { conditions: [], ...t } : t,
      ),
    };
  },
  // Subjects can have a picked palette or custom colors (SYSTEM_DESIGN §10.5). Every
  // subject so far takes its palette from its name, which a missing `colorSource` means,
  // so only the version changes; it keeps an older copy of the app from dropping colors.
  3: (file) => ({ ...file, schemaVersion: 4 }),
  // Teachers can have a phone number (SYSTEM_DESIGN §11.2), which none has yet, so only the
  // version changes; it keeps an older copy of the app from dropping phone numbers.
  4: (file) => ({ ...file, schemaVersion: 5 }),
  // Grades become a list of their own (SYSTEM_DESIGN §13.1): the grades the classes use, in
  // order, so a file with no classes has none. A class whose grade isn't a number adds
  // nothing here, and the schema then refuses the file.
  5: (file) => {
    const { classes } = file;
    const graded = (c: unknown): c is { grade: number } =>
      typeof c === 'object' && c !== null && typeof (c as RawFile).grade === 'number';
    const used = Array.isArray(classes) ? classes.filter(graded) : [];
    return { ...file, schemaVersion: 6, grades: gradesOf(used) };
  },
};

export type ReadResult =
  { ok: true; file: TimetableFile; upgradedFrom: number | null } | { ok: false; reason: string };

export function readTimetableFile(
  text: string,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  currentVersion: number = SCHEMA_VERSION,
): ReadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "The file isn't valid JSON. It may have been cut short." };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "The file doesn't hold a timetable." };
  }

  let file = raw as RawFile;
  const version = file.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { ok: false, reason: "The file doesn't say which format version it uses." };
  }
  if (version > currentVersion) {
    return {
      ok: false,
      reason: `The file was saved by a newer version of TimeTableMaker (format ${version}).`,
    };
  }
  for (let from = version; from < currentVersion; from++) {
    const migrate = migrations[from];
    if (!migrate) {
      return { ok: false, reason: `Files in format ${version} can't be upgraded.` };
    }
    try {
      file = migrate(file);
    } catch {
      return { ok: false, reason: `The file couldn't be upgraded from format ${from}.` };
    }
  }

  const checked = timetableFileSchema.safeParse(file);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    const where = issue && issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
    return {
      ok: false,
      reason: `The file doesn't match the timetable format${where}: ${issue?.message ?? 'unknown problem'}.`,
    };
  }
  return { ok: true, file: checked.data, upgradedFrom: version < currentVersion ? version : null };
}

export function serializeTimetableFile(file: TimetableFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
