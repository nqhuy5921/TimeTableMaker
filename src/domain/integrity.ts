import { parseClassName } from './className';
import { conditionValueProblem } from './conditions';
import type { BlockIndex, TimetableFile } from './model';

// What a timetable file must hold together beyond the shape of each record: ids that are
// unique, references that point at something, class names that match their grade and
// track, a grade list in order with every class's grade on it, slots the drop table could have made (SYSTEM_DESIGN §3), and teachers'
// conditions with allowed values (§9.1). The file schema
// runs this when a file is loaded and before each save, so a file edited by hand or a bug
// can't put the grid and the counts out of step.

export interface FileProblem {
  /** Where in the file, as zod would name it, such as ["cards", 3, "subjectId"]. */
  path: (string | number)[];
  message: string;
}

const BLOCKS: readonly BlockIndex[] = [0, 1, 2, 3, 4];
const LISTS = ['subjects', 'teachers', 'rooms', 'classes', 'cards', 'placements'] as const;

/** The first thing wrong with the file, or null when it holds together. */
export function fileProblem(file: TimetableFile): FileProblem | null {
  // Each of the five blocks once in the bell schedule (TB-2).
  for (const block of BLOCKS) {
    const count = file.bellSchedule.filter((r) => r.kind === 'block' && r.block === block).length;
    if (count !== 1) {
      return {
        path: ['bellSchedule'],
        message: `the bell schedule has periods ${block * 2 + 1}–${block * 2 + 2} ${count} times`,
      };
    }
  }

  for (const list of LISTS) {
    const seen = new Set<string>();
    for (const [index, item] of file[list].entries()) {
      if (seen.has(item.id)) {
        return { path: [list, index, 'id'], message: `the id ${item.id} is used twice` };
      }
      seen.add(item.id);
    }
  }

  // The grade list (DM-8, SYSTEM_DESIGN §13.1): in number order with no repeats, and every
  // class's grade on it.
  for (const [index, grade] of file.grades.entries()) {
    if (index > 0 && grade <= file.grades[index - 1]!) {
      return { path: ['grades', index], message: 'the grades are out of order or repeated' };
    }
  }
  const grades = new Set(file.grades);

  const teachers = new Set(file.teachers.map((t) => t.id));
  const names = new Set<string>();
  for (const [index, c] of file.classes.entries()) {
    const parsed = parseClassName(c.name);
    if (
      !parsed ||
      parsed.name !== c.name ||
      parsed.grade !== c.grade ||
      parsed.track !== c.track ||
      parsed.section !== c.section
    ) {
      return {
        path: ['classes', index],
        message: `class ${c.name} doesn't match its grade, track, and section`,
      };
    }
    if (!grades.has(c.grade)) {
      return {
        path: ['classes', index, 'grade'],
        message: `class ${c.name} is in grade ${c.grade}, which isn't in the grade list`,
      };
    }
    if (names.has(c.name)) {
      return {
        path: ['classes', index, 'name'],
        message: `there are two classes called ${c.name}`,
      };
    }
    names.add(c.name);
    for (const field of ['formTeacherId', 'coTeacherId'] as const) {
      const id = c[field];
      if (id !== undefined && !teachers.has(id)) {
        return {
          path: ['classes', index, field],
          message: `class ${c.name} names a missing teacher`,
        };
      }
    }
  }

  const subjects = new Set(file.subjects.map((s) => s.id));

  // Teachers' conditions (release 2, SYSTEM_DESIGN §9.1): ids unique across the file, a
  // subject limit's subject in the list, and values the condition form allows.
  const conditionIds = new Set<string>();
  for (const [t, teacher] of file.teachers.entries()) {
    for (const [index, condition] of teacher.conditions.entries()) {
      const path = ['teachers', t, 'conditions', index];
      if (conditionIds.has(condition.id)) {
        return { path: [...path, 'id'], message: `the condition id ${condition.id} is used twice` };
      }
      conditionIds.add(condition.id);
      if (condition.type === 'subjectLimit' && !subjects.has(condition.subjectId)) {
        return {
          path: [...path, 'subjectId'],
          message: `a condition of ${teacher.shortName} names a subject that isn't in the file`,
        };
      }
      const problem = conditionValueProblem(condition);
      if (problem) {
        return { path, message: `a condition of ${teacher.shortName} is wrong: ${problem}` };
      }
    }
  }

  const classes = new Set(file.classes.map((c) => c.id));
  const rooms = new Set(file.rooms.map((r) => r.id));
  const cardIds = new Set(file.cards.map((c) => c.id));
  const cardOfTriple = new Map<string, string>();
  for (const [index, card] of file.cards.entries()) {
    const missing = !subjects.has(card.subjectId)
      ? 'subjectId'
      : card.teacherId !== null && !teachers.has(card.teacherId)
        ? 'teacherId'
        : card.roomId !== null && !rooms.has(card.roomId)
          ? 'roomId'
          : null;
    if (missing) {
      return {
        path: ['cards', index, missing],
        message: `card ${card.id} points at a ${missing.slice(0, -2)} that isn't in the file`,
      };
    }
    // No two cards with the same subject, teacher, and room; empty counts as a value (DM-5).
    const triple = JSON.stringify([card.subjectId, card.teacherId, card.roomId]);
    const twin = cardOfTriple.get(triple);
    if (twin !== undefined) {
      return { path: ['cards', index], message: `cards ${twin} and ${card.id} are the same card` };
    }
    cardOfTriple.set(triple, card.id);
  }

  // A slot holds one full block or up to one card per half (TB-4).
  const slots = new Map<string, Set<string>>();
  for (const [index, p] of file.placements.entries()) {
    if (!cardIds.has(p.cardId)) {
      return {
        path: ['placements', index, 'cardId'],
        message: `placement ${p.id} is of a card that isn't in the file`,
      };
    }
    if (!classes.has(p.classId)) {
      return {
        path: ['placements', index, 'classId'],
        message: `placement ${p.id} is in a class that isn't in the file`,
      };
    }
    const slot = `${p.classId} ${p.day} ${p.block}`;
    const parts = slots.get(slot) ?? new Set();
    if (parts.has(p.part) || (p.part === 'full' ? parts.size > 0 : parts.has('full'))) {
      return {
        path: ['placements', index],
        message: `placement ${p.id} overlaps another card in its slot`,
      };
    }
    parts.add(p.part);
    slots.set(slot, parts);
  }

  return null;
}
