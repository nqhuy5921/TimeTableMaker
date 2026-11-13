import { parseClassName } from '../src/domain/className';
import type {
  BlockIndex,
  Card,
  Day,
  Id,
  Placement,
  PlacementPart,
  SchoolClass,
  TeacherCondition,
  TimetableFile,
} from '../src/domain/model';
import { defaultColorKey } from '../src/domain/subjectColor';
import { createEmptyTimetable } from '../src/domain/timetableFile';

// A bigger made-up school for looking at the screens by eye (asked for on 2026-10-21),
// opened with `npm run dev:review`. Every teacher name is invented and was checked to be
// absent from the reference workbook. It's built to show the layout that can still move:
//
// - 6A1's grid is nearly full with 17 subjects, so the "Periods per subject" tags wrap.
// - Grade 6 has 11 classes, so its row in the class bar scrolls sideways.
// - The pool has 45 cards, one subject name is long, and the Thể dục card with Thầy Tùng
//   is on all 11 grade 6 classes, so its Classes cell on the Cards page wraps.
// - Some cards are on no grid, for the Cards page's "Not placed" filter.
// - Release 2's issues (added at R2-6): the classes' cards clash here and there, two
//   teacher conditions are broken in 6A1, one is met, one is switched off, and 6AA2 has
//   Toán twice on Thursday, a warning.
// - Release 4's export (added at R4-7): every teacher has a full name, most an email and a
//   phone, and every class but 9BA1 has a homeroom teacher, every third one an assistant
//   too, so the exported headers and `Data ` are filled.

const SUBJECTS = [
  'Toán',
  'Ngữ văn',
  'Tiếng Anh',
  'KHTN - Lý',
  'KHTN - Hoá',
  'KHTN - Sinh',
  'Lịch sử',
  'Địa lý',
  'GDCD',
  'Tin học',
  'Công nghệ',
  'Thể dục',
  'Âm nhạc',
  'Mỹ thuật',
  'Hoạt động trải nghiệm, hướng nghiệp',
  'SH lớp',
  'Toán phân hoá/ Ngoại ngữ 2',
];

const TEACHERS = [
  'Cô Ngân',
  'Thầy Phúc',
  'Thầy Quân',
  'Cô Vy',
  'Thầy Đạt',
  'Cô Trâm',
  'Thầy Hiếu',
  'Thầy Tùng',
  'Thầy Khải',
  'Cô Thoa',
  'Cô Uyên',
  'Thầy Vĩnh',
  'Cô Khuê',
  'Cô Lụa',
  'Thầy Mẫn',
  'Thầy Ninh',
  'Cô Quyên',
  'Cô Sương',
  'Cô Thục',
  'Thầy Vương',
];

// A few teachers' conditions, so the Issues tab and the teacher screens show them.
const CONDITIONS: Record<string, TeacherCondition[]> = {
  // Thursday in 6A1: periods 1–2 and 9–10, three free blocks between.
  'Thầy Phúc': [{ id: 'cond-phuc-gaps', on: true, type: 'maxGapsPerDay', max: 2 }],
  // Monday in 6A1: 3–4 and both halves of 9–10, 4 periods.
  'Cô Ngân': [{ id: 'cond-ngan-day', on: true, type: 'maxPeriodsPerDay', max: 3 }],
  // Met: no lessons on Thursday.
  'Thầy Hiếu': [{ id: 'cond-hieu-off', on: true, type: 'daysOff', days: [3] }],
  // Switched off: she teaches on every day.
  'Cô Vy': [{ id: 'cond-vy-days', on: false, type: 'maxTeachingDays', max: 2 }],
};

for (const name of Object.keys(CONDITIONS)) {
  if (!TEACHERS.includes(name)) throw new Error(`No teacher ${name} for CONDITIONS`);
}

// [full name, email, phone] by short name, in TEACHERS' order; '' for none. Every name was
// checked to be absent from the reference workbook, and the phones are made up.
const CONTACTS: Record<string, [string, string, string]> = {
  'Cô Ngân': ['Vũ Kim Ngân', 'ngan.vk@example.com', '0901 234 501'],
  'Thầy Phúc': ['Hà Minh Phúc', 'phuc.hm@example.com', '0901 234 502'],
  'Thầy Quân': ['Lại Văn Quân', 'quan.lv@example.com', ''],
  'Cô Vy': ['Đinh Tường Vy', '', '0901 234 504'],
  'Thầy Đạt': ['Phí Quốc Đạt', 'dat.pq@example.com', '0901 234 505'],
  'Cô Trâm': ['Tôn Bảo Trâm', 'tram.tb@example.com', ''],
  'Thầy Hiếu': ['Cù Trung Hiếu', 'hieu.ct@example.com', '0901 234 507'],
  'Thầy Tùng': ['Âu Sơn Tùng', '', '0901 234 508'],
  'Thầy Khải': ['Kiều Đăng Khải', 'khai.kd@example.com', ''],
  'Cô Thoa': ['Mai Kim Thoa', 'thoa.mk@example.com', '0901 234 510'],
  'Cô Uyên': ['Châu Tố Uyên', 'uyen.ct@example.com', '0901 234 511'],
  'Thầy Vĩnh': ['Lò Văn Vĩnh', '', ''],
  'Cô Khuê': ['Diệp Minh Khuê', 'khue.dm@example.com', '0901 234 513'],
  'Cô Lụa': ['Văn Thị Lụa', 'lua.vt@example.com', '0901 234 514'],
  'Thầy Mẫn': ['Quách Tấn Mẫn', 'man.qt@example.com', ''],
  'Thầy Ninh': ['Giáp Hữu Ninh', '', '0901 234 516'],
  'Cô Quyên': ['Bạch Lệ Quyên', 'quyen.bl@example.com', '0901 234 517'],
  'Cô Sương': ['Ninh Thị Sương', 'suong.nt@example.com', ''],
  'Cô Thục': ['Từ Ngọc Thục', 'thuc.tn@example.com', '0901 234 519'],
  'Thầy Vương': ['Mạc Đình Vương', '', '0901 234 520'],
};

for (const name of TEACHERS) {
  if (!CONTACTS[name]) throw new Error(`No contacts for ${name}`);
}

const ROOMS = [
  'P101',
  'P102',
  'P103',
  'P104',
  'P105',
  'P106',
  'P201',
  'P202',
  'P203',
  'Phòng Tin 1',
  'Phòng Lab',
  'Sân thể chất',
  'Phòng nhạc',
  'Phòng mỹ thuật',
];

const CLASSES = [
  ...['6A1', '6A2', '6A3', '6A4', '6A5', '6AA1', '6AA2', '6CE1', '6CE2', '6B1', '6BA1'],
  ...['7A1', '7A2', '7AA1', '7CE1'],
  ...['8A1', '8CE1', '8B1'],
  ...['9A1', '9B1', '9BA1'],
];

const subjectId = (name: string) => `s-${SUBJECTS.indexOf(name)}`;
const teacherId = (name: string) => `t-${TEACHERS.indexOf(name)}`;
const roomId = (name: string) => `r-${ROOMS.indexOf(name)}`;
const classId = (name: string) => `c-${name.toLowerCase()}`;

// [card id, subject, teacher, room], in no particular order: the app sorts the pool.
const CARDS: [Id, string, string | null, string | null][] = [
  ['toan-phuc', 'Toán', 'Thầy Phúc', 'P101'],
  ['toan-quan', 'Toán', 'Thầy Quân', 'P102'],
  ['toan-khai', 'Toán', 'Thầy Khải', 'P103'],
  ['toan-quan-201', 'Toán', 'Thầy Quân', 'P201'],
  ['toan-phuc-noroom', 'Toán', 'Thầy Phúc', null],
  ['van-ngan', 'Ngữ văn', 'Cô Ngân', 'P101'],
  ['van-thoa', 'Ngữ văn', 'Cô Thoa', 'P102'],
  ['van-uyen', 'Ngữ văn', 'Cô Uyên', 'P103'],
  ['van-ngan-201', 'Ngữ văn', 'Cô Ngân', 'P201'],
  ['anh-vy', 'Tiếng Anh', 'Cô Vy', 'P101'],
  ['anh-tram', 'Tiếng Anh', 'Cô Trâm', 'P102'],
  ['anh-vy-104', 'Tiếng Anh', 'Cô Vy', 'P104'],
  ['anh-khue', 'Tiếng Anh', 'Cô Khuê', 'P202'],
  ['ly-dat', 'KHTN - Lý', 'Thầy Đạt', 'Phòng Lab'],
  ['ly-vinh', 'KHTN - Lý', 'Thầy Vĩnh', 'Phòng Lab'],
  ['hoa-lua', 'KHTN - Hoá', 'Cô Lụa', 'Phòng Lab'],
  ['sinh-man', 'KHTN - Sinh', 'Thầy Mẫn', 'Phòng Lab'],
  ['su-tram', 'Lịch sử', 'Cô Trâm', 'P104'],
  ['su-ninh', 'Lịch sử', 'Thầy Ninh', 'P105'],
  ['dia-ninh', 'Địa lý', 'Thầy Ninh', 'P105'],
  ['dia-quyen', 'Địa lý', 'Cô Quyên', 'P106'],
  ['gdcd-suong', 'GDCD', 'Cô Sương', 'P106'],
  ['tin-hieu', 'Tin học', 'Thầy Hiếu', 'Phòng Tin 1'],
  ['tin-thuc', 'Tin học', 'Cô Thục', 'Phòng Tin 1'],
  ['cn-vuong', 'Công nghệ', 'Thầy Vương', 'P203'],
  ['td-tung', 'Thể dục', 'Thầy Tùng', 'Sân thể chất'],
  ['td-khai', 'Thể dục', 'Thầy Khải', 'Sân thể chất'],
  ['nhac-quyen', 'Âm nhạc', 'Cô Quyên', 'Phòng nhạc'],
  ['mt-suong', 'Mỹ thuật', 'Cô Sương', 'Phòng mỹ thuật'],
  ['hdtn-ngan', 'Hoạt động trải nghiệm, hướng nghiệp', 'Cô Ngân', null],
  ['hdtn-thoa', 'Hoạt động trải nghiệm, hướng nghiệp', 'Cô Thoa', null],
  ['hdtn-none', 'Hoạt động trải nghiệm, hướng nghiệp', null, null],
  ['shl-ngan', 'SH lớp', 'Cô Ngân', null],
  ['shl-thoa', 'SH lớp', 'Cô Thoa', null],
  ['shl-uyen', 'SH lớp', 'Cô Uyên', null],
  ['shl-none', 'SH lớp', null, null],
  ['split-phuc', 'Toán phân hoá/ Ngoại ngữ 2', 'Thầy Phúc', 'P102'],
  ['split-khai', 'Toán phân hoá/ Ngoại ngữ 2', 'Thầy Khải', 'P104'],
  ['su-ninh-201', 'Lịch sử', 'Thầy Ninh', 'P201'],
  ['dia-quyen-202', 'Địa lý', 'Cô Quyên', 'P202'],
  ['gdcd-suong-203', 'GDCD', 'Cô Sương', 'P203'],
  ['cn-vuong-lab', 'Công nghệ', 'Thầy Vương', 'Phòng Lab'],
  ['nhac-quyen-201', 'Âm nhạc', 'Cô Quyên', 'P201'],
  ['mt-suong-202', 'Mỹ thuật', 'Cô Sương', 'P202'],
  ['sinh-man-103', 'KHTN - Sinh', 'Thầy Mẫn', 'P103'],
];

/** A block of a grid: one card on the whole block, two halves, or nothing. */
type Block = Id | [Id | null, Id | null] | null;

// 6A1, Monday to Friday, blocks 1–2 to 9–10: 17 subjects, 46 of 50 periods.
const GRID_6A1: Block[][] = [
  ['toan-phuc', 'van-ngan', 'anh-vy', 'ly-dat', ['shl-ngan', 'hdtn-ngan']],
  ['van-ngan', 'toan-phuc', 'tin-hieu', 'su-tram', 'td-tung'],
  ['anh-vy', 'hoa-lua', 'dia-ninh', ['cn-vuong', 'gdcd-suong'], 'sinh-man'],
  ['toan-phuc', 'van-ngan', 'nhac-quyen', 'mt-suong', 'split-phuc'],
  ['anh-vy', ['tin-hieu', null], 'td-tung', null, ['ly-dat', null]],
];

// The other classes get a few cards each, starting at a different block, so the class
// bar's counts vary. Thể dục with Thầy Tùng goes on every grade 6 class.
const GRADE_6_CARDS = ['td-tung', 'toan-quan', 'van-thoa', 'anh-tram', 'tin-thuc', 'su-ninh'];
const UPPER_CARDS = ['toan-khai', 'van-uyen', 'anh-vy-104', 'ly-vinh', 'td-khai', 'dia-quyen'];

function placementsFor(): Placement[] {
  const placements: Placement[] = [];
  const add = (cls: string, cardId: Id, day: number, block: number, part: PlacementPart) =>
    placements.push({
      id: `p-${placements.length + 1}`,
      cardId,
      classId: classId(cls),
      day: day as Day,
      block: block as BlockIndex,
      part,
    });

  GRID_6A1.forEach((blocks, day) =>
    blocks.forEach((cell, block) => {
      if (typeof cell === 'string') add('6A1', cell, day, block, 'full');
      else if (cell) {
        if (cell[0]) add('6A1', cell[0], day, block, 'first');
        if (cell[1]) add('6A1', cell[1], day, block, 'second');
      }
    }),
  );

  CLASSES.slice(1).forEach((cls, i) => {
    const cards = cls.startsWith('6') ? GRADE_6_CARDS : UPPER_CARDS;
    const count = 1 + ((i * 5) % cards.length);
    for (let j = 0; j < count; j++) {
      const slot = (i * 3 + j * 4) % 25;
      add(cls, cards[j]!, Math.floor(slot / 5), slot % 5, 'full');
    }
  });
  // A second Toán on Thursday in 6AA2 (it has one in 9–10): subject twice in a day.
  add('6AA2', 'toan-quan', 3, 2, 'full');
  return placements;
}

/** The class with no homeroom teacher, as a class from the class bar's "New class" has. */
const NO_HOMEROOM = '9BA1';

if (!CLASSES.includes(NO_HOMEROOM)) throw new Error(`No class ${NO_HOMEROOM} for NO_HOMEROOM`);

/** A class with its homeroom teacher, taking TEACHERS in turn, and every third one an
    assistant too; NO_HOMEROOM has neither. */
function schoolClass(name: string, index: number): SchoolClass {
  const parsed = parseClassName(name);
  if (!parsed) throw new Error(`Bad class name ${name}`);
  if (name === NO_HOMEROOM) return { id: classId(name), ...parsed };
  const teacher = (offset: number) => teacherId(TEACHERS[(index + offset) % TEACHERS.length]!);
  return {
    id: classId(name),
    ...parsed,
    formTeacherId: teacher(0),
    ...(index % 3 === 0 ? { coTeacherId: teacher(7) } : {}),
  };
}

export const reviewSchool: TimetableFile = {
  ...createEmptyTimetable(),
  grades: [6, 7, 8, 9],
  subjects: SUBJECTS.map((name) => ({
    id: subjectId(name),
    name,
    colorKey: defaultColorKey(name),
  })),
  teachers: TEACHERS.map((shortName) => {
    const [fullName, email, phone] = CONTACTS[shortName]!;
    return {
      id: teacherId(shortName),
      shortName,
      fullName,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      conditions: CONDITIONS[shortName] ?? [],
    };
  }),
  rooms: ROOMS.map((name) => ({ id: roomId(name), name })),
  classes: CLASSES.map((name, index) => schoolClass(name, index)),
  cards: CARDS.map(([id, subject, teacher, room]): Card => ({
    id,
    subjectId: subjectId(subject),
    teacherId: teacher === null ? null : teacherId(teacher),
    roomId: room === null ? null : roomId(room),
  })),
  placements: placementsFor(),
};

/** The class the review opens on. */
export const REVIEW_CLASS_ID = classId('6A1');
