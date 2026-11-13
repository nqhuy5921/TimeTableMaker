import type { BlockIndex, ScheduleRow } from './model';

/** The school day from the TIMETABLE sheet of the sample workbook. */
export const DEFAULT_BELL_SCHEDULE: readonly ScheduleRow[] = [
  {
    kind: 'break',
    type: 'arrival',
    label: 'Breakfast',
    note: 'Đón học sinh, ăn sáng',
    start: '07:00',
    end: '07:50',
  },
  {
    kind: 'break',
    type: 'arrival',
    label: 'Getting ready',
    note: 'Hoạt động đầu ngày',
    dayLabels: [{ day: 0, label: 'Flag salute', note: 'Chào cờ' }],
    start: '07:50',
    end: '08:00',
  },
  { kind: 'block', block: 0, label: '1-2', start: '08:00', end: '09:10' },
  { kind: 'break', type: 'break', label: 'Break', start: '09:10', end: '09:20' },
  { kind: 'block', block: 1, label: '3-4', start: '09:20', end: '10:30' },
  { kind: 'break', type: 'break', label: 'Break', start: '10:30', end: '10:40' },
  { kind: 'block', block: 2, label: '5-6', start: '10:40', end: '11:50' },
  { kind: 'break', type: 'lunch', label: 'Lunch break', start: '11:50', end: '13:20' },
  { kind: 'block', block: 3, label: '7-8', start: '13:20', end: '14:30' },
  { kind: 'break', type: 'break', label: 'Snack break', start: '14:30', end: '14:50' },
  { kind: 'block', block: 4, label: '9-10', start: '14:50', end: '16:00' },
];

export interface Period {
  /** 1 to 10. */
  number: number;
  start: string;
  end: string;
}

export function toMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** A block is two periods of equal length: 08:00–09:10 is 08:00–08:35 and 08:35–09:10. */
export function blockPeriods(row: {
  block: BlockIndex;
  start: string;
  end: string;
}): [Period, Period] {
  const start = toMinutes(row.start);
  const middle = fromMinutes(start + Math.round((toMinutes(row.end) - start) / 2));
  return [
    { number: row.block * 2 + 1, start: row.start, end: middle },
    { number: row.block * 2 + 2, start: middle, end: row.end },
  ];
}

/** The blocks of each part of the day, split at the lunch row: blocks 1-2 to 5-6 and
    7-8 to 9-10 in the school's schedule. A schedule with no lunch is one part. */
export function daySessions(schedule: readonly ScheduleRow[]): BlockIndex[][] {
  const sessions: BlockIndex[][] = [[]];
  for (const row of schedule) {
    if (row.kind === 'block') sessions.at(-1)!.push(row.block);
    else if (row.type === 'lunch') sessions.push([]);
  }
  return sessions.filter((s) => s.length > 0);
}
