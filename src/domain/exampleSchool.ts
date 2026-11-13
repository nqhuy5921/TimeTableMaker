import type { BlockIndex, Card, Day, Id, Placement, PlacementPart, TimetableFile } from './model';
import { createEmptyTimetable } from './timetableFile';

// The made-up sample school: the example workbook's data (Download example, IE-1), and what
// the acceptance tests run on (R1-8, extended for release 2 at R2-6 and release 3 at R3-4;
// moved here from fixtures/ at R5-3, where what the tests expect of it stays). Every name,
// email, and room is invented: none comes from the reference workbook.
//
// Six classes across the five tracks, ten subjects, eight teachers, and six rooms:
//
// - 6A1 is the busiest: full blocks, two half cards sharing Friday 9–10, a half card
//   alone on Wednesday 1–2, and the split-group card "Toán phân hoá/ Ngoại ngữ 2".
//   18 periods placed.
// - 6A2 has Ngữ văn with the same teacher as 6A1's, in the same block (Monday 3–4):
//   allowed (TB-4), and an error since release 2. 8 periods placed.
// - 7AA1 and 8CE1 have a few placements, 7AA1 with a card that has no teacher or room.
// - Two cards (k-9b1-toan, k-9b1-ly) are on no grid; 9B1 and 9BA1 have nothing placed.
// - Tiếng Anh is on two grids: one card (Cô Vy, P101) is placed in 6A1 and in 6A2.
//
// Release 2's issues (SYSTEM_DESIGN §9.6), listed in SAMPLE_ISSUES. Every condition type
// is broken once, a few others sit just at their limit, and one is switched off. They're
// placed so the slots release 1's acceptance tests name exactly keep their names: the
// new placements are in 6A2 and 7AA1, and the conditions break elsewhere. One marked slot
// is read by those tests: Thầy Tùng's day off marks 6A1's Tuesday 7–8, which the DM-5
// "looks the same" test compares by text and colors only.
//
// - Always on: Cô Ngân in two places (6A1 and 6A2, Monday 3–4); room P201 in use twice
//   (6A2 and 7AA1, Wednesday 7–8).
// - Thầy Hiếu's Tin học card is on two grids in the same block, 6A1 in the second half
//   and 7AA1 in the first: different times, so not a clash, for him or for Phòng Tin 1.
// - Subject twice in a day (a warning): 7AA1 has KHTN - Lý in 7–8 and 9–10 on Wednesday.
//
// Release 3 (R3-4): every class but 9BA1 has a homeroom teacher, and four have an assistant
// too. The list pages' cases are already here: deleting room P101 merges Thầy Phúc's Toán
// in P101 into his Toán with no room (k-9b1-toan); Thầy Hiếu's subject limit names Tin học,
// so deleting Tin học deletes the limit too (R3-5b); and Lịch sử's one card is on two grids (7AA1 and 8CE1).
//
// Release 4 (moved here from the expected workbook at R4-7): four teachers have a phone, so
// the export's class headers and `Data ` have every mix. 6A1's homeroom teacher has a
// full name, phone, and email; 6A2's no phone; 7AA1's only a full name; 8CE1's a phone and
// no email; 9B1's not even a full name, so its short name stands in; and 9BA1 has none.

/** What Download example suggests saving it as. */
export const EXAMPLE_FILE_NAME = 'TKB example.xlsx';

// The file keeps only the pool of cards, and each placement names its class (SYSTEM_DESIGN
// §3a).
function card(id: Id, subjectId: Id, teacherId: Id | null, roomId: Id | null) {
  return { id, subjectId, teacherId, roomId } satisfies Card;
}

function placed(id: Id, cardId: Id, classId: Id, day: number, block: number, part: PlacementPart) {
  return {
    id,
    cardId,
    classId,
    day: day as Day,
    block: block as BlockIndex,
    part,
  } satisfies Placement;
}

export const exampleSchool: TimetableFile = {
  ...createEmptyTimetable(),
  grades: [6, 7, 8, 9],
  subjects: [
    { id: 's-toan', name: 'Toán', colorKey: 'math' },
    { id: 's-van', name: 'Ngữ văn', colorKey: 'literature' },
    { id: 's-anh', name: 'Tiếng Anh', colorKey: 'english' },
    { id: 's-ly', name: 'KHTN - Lý', colorKey: 'physics' },
    { id: 's-su', name: 'Lịch sử', colorKey: 'history' },
    { id: 's-tin', name: 'Tin học', colorKey: 'informatics' },
    { id: 's-td', name: 'Thể dục', colorKey: 'pe' },
    { id: 's-shl', name: 'SH lớp', colorKey: 'homeroom' },
    { id: 's-gdpc', name: 'GDPC', colorKey: 'homeroom' },
    // A block where the class splits into groups: one ordinary card (DM-5).
    { id: 's-split', name: 'Toán phân hoá/ Ngoại ngữ 2', colorKey: 'homeroom' },
  ],
  teachers: [
    {
      id: 't-ngan',
      shortName: 'Cô Ngân',
      fullName: 'Lương Thị Ngân',
      email: 'ngan.lt@example.com',
      phone: '0912 345 678',
      school: 'THCS',
      // Thursday: periods 1–2 in 6A1 and 9 in 7AA1, three free blocks between.
      conditions: [{ id: 'cond-ngan-gaps', on: true, type: 'maxGapsPerDay', max: 2 }],
    },
    {
      id: 't-phuc',
      shortName: 'Thầy Phúc',
      fullName: 'Tạ Văn Phúc',
      email: 'phuc.tv@example.com',
      school: 'both',
      conditions: [],
    },
    {
      id: 't-quan',
      shortName: 'Thầy Quân',
      fullName: 'Ông Đức Quân',
      phone: '0987 654 321',
      school: 'THCS',
      conditions: [],
    },
    {
      id: 't-vy',
      shortName: 'Cô Vy',
      fullName: 'Lạc Thảo Vy',
      email: 'vy.lt@example.com',
      phone: '+84 903 111 222',
      // Tuesday in 6A1 and Wednesday in 6A2: 2 days, 4 periods (just at that limit).
      conditions: [
        { id: 'cond-vy-days', on: true, type: 'maxTeachingDays', max: 1 },
        { id: 'cond-vy-week', on: true, type: 'maxPeriodsPerWeek', max: 4 },
      ],
    },
    {
      id: 't-dat',
      shortName: 'Thầy Đạt',
      fullName: 'Kha Minh Đạt',
      school: 'THPT',
      // Shared with THPT, busy there on Wednesday afternoon's last block. Wednesday 7–10
      // in 7AA1 breaks all three.
      conditions: [
        { id: 'cond-dat-day', on: true, type: 'maxPeriodsPerDay', max: 3 },
        { id: 'cond-dat-week', on: true, type: 'maxPeriodsPerWeek', max: 3 },
        { id: 'cond-dat-thpt', on: true, type: 'unavailable', blocks: [4], days: [2] },
      ],
    },
    {
      id: 't-tram',
      shortName: 'Cô Trâm',
      fullName: 'Ứng Ngọc Trâm',
      phone: '024 3826 1234',
      // Thursday 3–4 in 8CE1, then 5–6 in 7AA1: 4 periods (just at that limit).
      conditions: [
        { id: 'cond-tram-row', on: true, type: 'maxBlocksInRow', max: 1 },
        { id: 'cond-tram-day', on: true, type: 'maxPeriodsPerDay', max: 4 },
      ],
    },
    {
      id: 't-hieu',
      shortName: 'Thầy Hiếu',
      // Two halves of Tin học on Friday, one on Wednesday (just at the limit).
      conditions: [
        {
          id: 'cond-hieu-tin',
          on: true,
          type: 'subjectLimit',
          subjectId: 's-tin',
          max: 1,
          per: 'day',
        },
      ],
    },
    {
      id: 't-tung',
      shortName: 'Thầy Tùng',
      fullName: 'Mạc Thanh Tùng',
      // Thể dục in 6A1 on Tuesday afternoon breaks the day off, and would break the
      // afternoons if that one weren't switched off.
      conditions: [
        { id: 'cond-tung-off', on: true, type: 'daysOff', days: [1] },
        {
          id: 'cond-tung-pm',
          on: false,
          type: 'unavailable',
          blocks: [3, 4],
          days: [0, 1, 2, 3, 4],
        },
      ],
    },
  ],
  rooms: [
    { id: 'r-p101', name: 'P101' },
    { id: 'r-p102', name: 'P102' },
    { id: 'r-p201', name: 'P201' },
    { id: 'r-p202', name: 'P202' },
    { id: 'r-tin', name: 'Phòng Tin 1' },
    { id: 'r-san', name: 'Sân thể chất' },
  ],
  // Homeroom teachers (formTeacherId) and assistants (coTeacherId), release 3 (DM-2): most
  // classes have both, 6A2 and 9B1 only a homeroom teacher, and 9BA1 neither, as a class
  // added from the class bar's "New class" has.
  classes: [
    {
      id: 'c-6a1',
      name: '6A1',
      grade: 6,
      track: 'A',
      section: 1,
      formTeacherId: 't-ngan',
      coTeacherId: 't-quan',
    },
    { id: 'c-6a2', name: '6A2', grade: 6, track: 'A', section: 2, formTeacherId: 't-phuc' },
    {
      id: 'c-7aa1',
      name: '7AA1',
      grade: 7,
      track: 'AA',
      section: 1,
      formTeacherId: 't-dat',
      coTeacherId: 't-tram',
    },
    {
      id: 'c-8ce1',
      name: '8CE1',
      grade: 8,
      track: 'CE',
      section: 1,
      formTeacherId: 't-tram',
      coTeacherId: 't-vy',
    },
    { id: 'c-9b1', name: '9B1', grade: 9, track: 'B', section: 1, formTeacherId: 't-hieu' },
    { id: 'c-9ba1', name: '9BA1', grade: 9, track: 'BA', section: 1 },
  ],
  cards: [
    card('k-6a1-toan', 's-toan', 't-phuc', 'r-p101'),
    card('k-6a1-van', 's-van', 't-ngan', 'r-p101'),
    // One Tiếng Anh card on two grids: 6A1 and 6A2 share the teacher and the room.
    card('k-anh-vy', 's-anh', 't-vy', 'r-p101'),
    card('k-6a1-tin', 's-tin', 't-hieu', 'r-tin'),
    card('k-6a1-td', 's-td', 't-tung', 'r-san'),
    card('k-6a1-shl', 's-shl', 't-ngan', null),
    card('k-6a1-gdpc', 's-gdpc', 't-ngan', null),
    card('k-6a1-split', 's-split', 't-phuc', 'r-p102'),

    // Same subject, another teacher and room than 6A1 (DM-5), except Ngữ văn.
    card('k-6a2-toan', 's-toan', 't-quan', 'r-p102'),
    card('k-6a2-van', 's-van', 't-ngan', 'r-p102'),

    card('k-7aa1-toan', 's-toan', 't-quan', 'r-p201'),
    card('k-7aa1-ly', 's-ly', 't-dat', 'r-p201'),
    card('k-7aa1-shl', 's-shl', null, null),

    card('k-8ce1-anh', 's-anh', 't-tram', 'r-p202'),
    card('k-8ce1-su', 's-su', 't-tram', 'r-p202'),

    card('k-9b1-toan', 's-toan', 't-phuc', null),
    card('k-9b1-ly', 's-ly', 't-dat', null),
  ],
  placements: [
    // 6A1: 7 full blocks (14) and 4 halves (4) = 18 periods.
    placed('p-6a1-1', 'k-6a1-toan', 'c-6a1', 0, 0, 'full'),
    placed('p-6a1-2', 'k-6a1-van', 'c-6a1', 0, 1, 'full'),
    placed('p-6a1-3', 'k-anh-vy', 'c-6a1', 1, 0, 'full'),
    placed('p-6a1-4', 'k-6a1-td', 'c-6a1', 1, 3, 'full'),
    placed('p-6a1-5', 'k-6a1-tin', 'c-6a1', 2, 0, 'first'),
    placed('p-6a1-6', 'k-6a1-toan', 'c-6a1', 2, 1, 'full'),
    placed('p-6a1-7', 'k-6a1-van', 'c-6a1', 3, 0, 'full'),
    placed('p-6a1-8', 'k-6a1-split', 'c-6a1', 3, 3, 'full'),
    placed('p-6a1-9', 'k-6a1-tin', 'c-6a1', 4, 2, 'second'),
    placed('p-6a1-10', 'k-6a1-shl', 'c-6a1', 4, 4, 'first'),
    placed('p-6a1-11', 'k-6a1-gdpc', 'c-6a1', 4, 4, 'second'),

    // 6A2: Ngữ văn on Monday 3–4, the same block and teacher as 6A1's.
    placed('p-6a2-1', 'k-6a2-van', 'c-6a2', 0, 1, 'full'),
    placed('p-6a2-2', 'k-6a2-toan', 'c-6a2', 1, 0, 'full'),
    placed('p-6a2-3', 'k-anh-vy', 'c-6a2', 2, 2, 'full'),
    // In P201 at the same time as 7AA1's KHTN - Lý.
    placed('p-6a2-4', 'k-7aa1-toan', 'c-6a2', 2, 3, 'full'),

    // 7AA1: 4 full blocks and 3 halves.
    placed('p-7aa1-1', 'k-7aa1-toan', 'c-7aa1', 0, 0, 'full'),
    placed('p-7aa1-2', 'k-7aa1-ly', 'c-7aa1', 2, 3, 'full'),
    placed('p-7aa1-3', 'k-7aa1-shl', 'c-7aa1', 4, 4, 'first'),
    placed('p-7aa1-4', 'k-7aa1-ly', 'c-7aa1', 2, 4, 'full'),
    placed('p-7aa1-5', 'k-8ce1-su', 'c-7aa1', 3, 2, 'full'),
    placed('p-7aa1-6', 'k-6a1-shl', 'c-7aa1', 3, 4, 'first'),
    placed('p-7aa1-7', 'k-6a1-tin', 'c-7aa1', 4, 2, 'first'),

    // 8CE1: two halves sharing Tuesday 1–2, and a full block.
    placed('p-8ce1-1', 'k-8ce1-anh', 'c-8ce1', 1, 0, 'first'),
    placed('p-8ce1-2', 'k-8ce1-su', 'c-8ce1', 1, 0, 'second'),
    placed('p-8ce1-3', 'k-8ce1-su', 'c-8ce1', 3, 1, 'full'),
  ],
};
