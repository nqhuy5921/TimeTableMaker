import { z } from 'zod';
import type { ExportDetails } from '../domain/exportSheets';
import { fileProblem } from '../domain/integrity';
import { cleanPhone, isPhoneNumber } from '../domain/teachers';
import {
  COLOR_KEYS,
  FIXED_ROW_TYPES,
  HOME_SCHOOLS,
  MAX_GRADE,
  MIN_GRADE,
  TRACKS,
  type TimetableFile,
} from '../domain/model';

// Checks a timetable file read from disk, and each one before it's saved. Unknown keys
// are dropped, so files saved before 2026-10-19 load without their subjects'
// defaultPeriods and cards' periodsPerWeek. Typed against the domain model, so the
// two can't drift apart without a type error. After the shape, `fileProblem` checks that
// the file holds together (ids, references, slots).

const id = z.string().min(1);
const day = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const block = day;
const time = z.string().regex(/^\d{2}:\d{2}$/);
const grade = z.number().int().min(MIN_GRADE).max(MAX_GRADE);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colors are written as #rrggbb');

const scheduleRow = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('block'), block, label: z.string(), start: time, end: time }),
  z.object({
    kind: z.literal('break'),
    type: z.enum(FIXED_ROW_TYPES),
    label: z.string(),
    note: z.string().optional(),
    dayLabels: z
      .array(z.object({ day, label: z.string(), note: z.string().optional() }))
      .min(1)
      .refine((labels) => new Set(labels.map((entry) => entry.day)).size === labels.length, {
        message: 'Each day can have only one label',
      })
      .optional(),
    start: time,
    end: time,
  }),
]);

// A teacher's condition (SYSTEM_DESIGN §9.1). The allowed values are checked by
// `fileProblem`, so a value out of range names the condition rather than a zod rule.
const conditionBase = { id, on: z.boolean() };
const count = z.number().int();
const teacherCondition = z.union([
  z.object({
    ...conditionBase,
    type: z.literal('subjectLimit'),
    subjectId: id,
    max: count,
    per: z.enum(['day', 'week']),
  }),
  z.object({
    ...conditionBase,
    type: z.literal('unavailable'),
    blocks: z.array(block),
    days: z.array(day),
  }),
  z.object({ ...conditionBase, type: z.literal('daysOff'), days: z.array(day) }),
  z.object({
    ...conditionBase,
    type: z.enum([
      'maxPeriodsPerDay',
      'maxPeriodsPerWeek',
      'maxBlocksInRow',
      'maxGapsPerDay',
      'maxTeachingDays',
    ]),
    max: count,
  }),
]);

export const timetableFileSchema: z.ZodType<TimetableFile> = z
  .object({
    schemaVersion: z.literal(6),
    bellSchedule: z.array(scheduleRow),
    grades: z.array(grade),
    // Custom colors come exactly with `colorSource: 'custom'` (SYSTEM_DESIGN §10.5).
    subjects: z.array(
      z
        .object({
          id,
          name: z.string().min(1),
          colorKey: z.enum(COLOR_KEYS),
          colorSource: z.enum(['palette', 'custom']).optional(),
          customColors: z.object({ bg: hexColor, ink: hexColor }).optional(),
        })
        .refine((s) => (s.colorSource === 'custom') === (s.customColors !== undefined), {
          message: "Custom colors go only with colorSource 'custom'",
          path: ['customColors'],
        }),
    ),
    teachers: z.array(
      z.object({
        id,
        shortName: z.string().min(1),
        fullName: z.string().optional(),
        email: z.string().optional(),
        school: z.enum(HOME_SCHOOLS).optional(),
        // Cleaned as the teacher form does, and an empty one left out, so a hand-edited
        // file reads as the form would have saved it.
        phone: z
          .string()
          .transform(cleanPhone)
          .refine((p) => p === '' || isPhoneNumber(p), 'Phone numbers have 8 to 15 digits')
          .transform((p) => p || undefined)
          .optional(),
        conditions: z.array(teacherCondition),
      }),
    ),
    rooms: z.array(z.object({ id, name: z.string().min(1) })),
    classes: z.array(
      z.object({
        id,
        name: z.string().min(1),
        grade,
        track: z.enum(TRACKS),
        section: z.number().int().min(1),
        formTeacherId: id.optional(),
        coTeacherId: id.optional(),
      }),
    ),
    cards: z.array(
      z.object({
        id,
        subjectId: id,
        teacherId: id.nullable(),
        roomId: id.nullable(),
      }),
    ),
    placements: z.array(
      z.object({
        id,
        cardId: id,
        classId: id,
        day,
        block,
        part: z.enum(['full', 'first', 'second']),
      }),
    ),
  })
  .superRefine((file, ctx) => {
    const problem = fileProblem(file);
    if (problem) ctx.addIssue({ code: 'custom', path: problem.path, message: problem.message });
  });

/** The Export dialog's details (SYSTEM_DESIGN §11.4), checked again in the main process
    before anything is written. */
export const exportDetailsSchema = z.object({
  schoolName: z.string().max(1000),
  schoolYear: z.string().max(100),
  appliesFrom: z.string().max(100),
}) satisfies z.ZodType<ExportDetails>;

/** `settings.json`. Anything it can't read falls back to the defaults. */
export const settingsSchema = z.object({
  selectedClassId: id.nullable().catch(null).default(null),
  /** The details of the profile's last export, which the Export dialog starts with. */
  exportDetails: exportDetailsSchema.optional().catch(undefined),
});

/** A change to `settings.json`: the fields given replace the saved ones, the others stay. */
export const settingsChangeSchema = z
  .object({ selectedClassId: id.nullable(), exportDetails: exportDetailsSchema })
  .partial()
  .strict();

/** `profiles.json` (SYSTEM_DESIGN §11.1): the profiles in the order made, and the open one.
    An id names the profile's folder, so it's only letters, digits, and dashes, and can't
    point outside `profiles/`; ids must be unique. Names are tidied once read
    (`tidyProfileNames`), so a hand-edited one doesn't make the whole list unreadable. */
export const PROFILE_ID = /^[A-Za-z0-9-]{1,64}$/;

export const profilesFileSchema = z
  .object({
    profiles: z.array(z.object({ id: z.string().regex(PROFILE_ID), name: z.string() })).min(1),
    openId: z.string(),
  })
  .refine(
    (list) => new Set(list.profiles.map((p) => p.id.toLowerCase())).size === list.profiles.length,
    { message: 'Each profile needs its own id' },
  );
