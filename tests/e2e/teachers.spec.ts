import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import { savedPath } from './dataFolder';
import { gradesOf } from '../../src/domain/grades';
import type { Teacher, TimetableFile } from '../../src/domain/model';
import { SCHEMA_VERSION, serializeTimetableFile } from '../../src/shared/fileFormat';

// The Teachers page and teacher detail screen (DM-1, release 2). Made-up names only.

let userData: string;

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
});

test.afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

async function withApp(run: (page: Page) => Promise<void>) {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    await run(await app.firstWindow());
  } finally {
    await app.close();
  }
}

/** Two teachers. Phúc's Toán in P101 is on 6A1's grid and matches a Toán in P101 with no
    teacher on 6A2's, so deleting him merges the two. His Văn is a half block. */
function seed(): TimetableFile {
  const file: TimetableFile = {
    ...emptySchool(),
    subjects: [
      { id: 'toan', name: 'Toán', colorKey: 'math' },
      { id: 'van', name: 'Ngữ văn', colorKey: 'literature' },
    ],
    teachers: [
      {
        id: 'phuc',
        shortName: 'Thầy Phúc',
        fullName: 'Tạ Văn Phúc',
        email: 'phuc@example.com',
        school: 'both',
        conditions: [],
      },
      { id: 'lan', shortName: 'Cô Lan', conditions: [] },
    ],
    rooms: [{ id: 'p101', name: 'P101' }],
    classes: [
      { id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1 },
      { id: 'c2', name: '6A2', grade: 6, track: 'A', section: 2 },
    ],
    cards: [
      { id: 'k-toan-phuc', subjectId: 'toan', teacherId: 'phuc', roomId: 'p101' },
      { id: 'k-toan-none', subjectId: 'toan', teacherId: null, roomId: 'p101' },
      { id: 'k-van-phuc', subjectId: 'van', teacherId: 'phuc', roomId: null },
    ],
    placements: [
      { id: 'p1', cardId: 'k-toan-phuc', classId: 'c1', day: 0, block: 0, part: 'full' },
      { id: 'p2', cardId: 'k-toan-none', classId: 'c2', day: 0, block: 0, part: 'full' },
      { id: 'p3', cardId: 'k-van-phuc', classId: 'c1', day: 1, block: 1, part: 'first' },
    ],
  };
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(file));
  return file;
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const openScreen = (page: Page, name: string) => menu(page).getByRole('button', { name }).click();
const table = (page: Page) => page.getByRole('table', { name: 'Teachers' });
const rows = (page: Page) =>
  table(page)
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader') });
const rowTexts = (page: Page) =>
  rows(page).evaluateAll((trs) =>
    trs.map((tr) => [...tr.children].map((td) => td.textContent ?? '').join(' | ')),
  );
const title = (page: Page) => page.getByRole('heading', { level: 1 });
const dialog = (page: Page) => page.getByRole('dialog');

/** The saved file, once the half-second save has gone out. */
async function savedFile(page: Page, check: (file: TimetableFile) => boolean) {
  let file: TimetableFile | null = null;
  await expect
    .poll(() => {
      file = JSON.parse(readFileSync(savedPath(userData), 'utf8')) as TimetableFile;
      return check(file);
    })
    .toBe(true);
  void page;
  return file!;
}

test('the Teachers page lists every teacher with their details and counts (DM-1)', async () => {
  seed();
  await withApp(async (page) => {
    await openScreen(page, 'Teachers');
    await expect(title(page)).toHaveText('Teachers');
    await expect(page.getByText('2 teachers')).toBeVisible();
    expect(await rowTexts(page)).toEqual([
      'Thầy Phúc | Tạ Văn Phúc | phuc@example.com | Both | 2 | 3 | 0 |  | ',
      'Cô Lan | — | — | — | 0 | 0 | 0 |  | ',
    ]);
    // The search ignores case and accents, and finds full names and emails.
    const search = page.getByRole('searchbox', { name: 'Search teachers' });
    await search.fill('ta van');
    expect(await rowTexts(page)).toHaveLength(1);
    await search.fill('nobody');
    await expect(page.getByText('No teacher matches “nobody”.')).toBeVisible();
  });
});

test('a row opens the detail screen, and the list comes back (DM-1)', async () => {
  seed();
  await withApp(async (page) => {
    await openScreen(page, 'Teachers');
    await rows(page).nth(0).getByRole('cell').nth(1).click();
    await expect(title(page)).toHaveText('Thầy Phúc');
    await expect(page.getByText('Tạ Văn Phúc · phuc@example.com · Both')).toBeVisible();
    const teaching = page.getByRole('region', { name: 'Teaching' });
    await expect(teaching.getByText('Periods this week')).toBeVisible();
    await expect(teaching.locator('dd').nth(0)).toHaveText('3');
    await expect(teaching.locator('dd').nth(1)).toHaveText('6A1');
    await expect(teaching.getByRole('listitem')).toHaveText(['ToánP1016A1', 'Ngữ vănNo room6A1']);
    await expect(page.getByText('No conditions yet')).toBeVisible();
    // The menu keeps Teachers active.
    await expect(menu(page).getByRole('button', { name: 'Teachers' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByRole('button', { name: 'Back to teachers' }).click();
    await expect(title(page)).toHaveText('Teachers');

    // Focus comes back to the teacher's row.
    await expect(page.getByRole('button', { name: 'Open Thầy Phúc' })).toBeFocused();

    // Leaving the page and coming back opens the list, not the teacher.
    await page.getByRole('button', { name: 'Open Cô Lan' }).click();
    await expect(title(page)).toHaveText('Cô Lan');
    await expect(page.getByText('No details yet')).toBeVisible();
    await openScreen(page, 'Cards');
    await openScreen(page, 'Teachers');
    await expect(title(page)).toHaveText('Teachers');
  });
});

test('Add teacher checks the short name, email, and phone, then opens the new teacher (DM-1)', async () => {
  seed();
  await withApp(async (page) => {
    await openScreen(page, 'Teachers');
    await page.getByRole('button', { name: 'Add teacher' }).click();
    const form = dialog(page);
    await expect(form.getByRole('heading', { name: 'Add teacher' })).toBeVisible();

    await form.getByRole('button', { name: 'Add teacher' }).click();
    await expect(form.getByRole('alert')).toHaveText("Enter the teacher's short name.");
    await form.getByLabel('Short name').fill('cô lan');
    await form.getByRole('button', { name: 'Add teacher' }).click();
    await expect(form.getByRole('alert')).toHaveText("There's already a teacher called Cô Lan.");

    await form.getByLabel('Short name').fill('T. Hoa');
    await form.getByLabel('Full name').fill('Trần Thị Hòa');
    await form.getByLabel('Email').fill('hoa at school');
    await form.getByRole('button', { name: 'Add teacher' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter an email like name@school.edu.vn.');
    await form.getByLabel('Email').fill('hoa@school.example');
    await form.getByLabel('Phone').fill('0912 34');
    await form.getByRole('button', { name: 'Add teacher' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a phone number like 0912 345 678.');
    await form.getByLabel('Phone').fill(' 0912 345 678 ');
    await form.getByLabel('Home school').selectOption('THCS');
    await form.getByRole('button', { name: 'Add teacher' }).click();

    await expect(form).toBeHidden();
    await expect(title(page)).toHaveText('T. Hoa');
    await expect(
      page.getByText('Trần Thị Hòa · hoa@school.example · 0912 345 678 · THCS'),
    ).toBeVisible();
    const file = await savedFile(page, (f) => f.teachers.length === 3);
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(file.teachers[2]).toMatchObject({
      shortName: 'T. Hoa',
      fullName: 'Trần Thị Hòa',
      email: 'hoa@school.example',
      phone: '0912 345 678',
      school: 'THCS',
      conditions: [],
    });
  });
});

test('Edit changes the details, and the new short name shows on the cards (DM-1)', async () => {
  seed();
  await withApp(async (page) => {
    await openScreen(page, 'Teachers');
    await page.getByRole('button', { name: 'Open Thầy Phúc' }).click();
    await page.getByRole('button', { name: 'Edit' }).click();
    const form = dialog(page);
    await expect(form.getByRole('heading', { name: 'Edit Thầy Phúc' })).toBeVisible();
    await expect(form.getByLabel('Short name')).toHaveValue('Thầy Phúc');
    await expect(form.getByLabel('Home school')).toHaveValue('both');
    await form.getByLabel('Short name').fill('Thầy Phúc Tạ');
    await form.getByLabel('Email').fill('');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form).toBeHidden();
    await expect(title(page)).toHaveText('Thầy Phúc Tạ');
    await expect(page.getByText('Tạ Văn Phúc · Both')).toBeVisible();

    await openScreen(page, 'Cards');
    await expect(page.getByRole('table', { name: 'Cards' }).getByText('Thầy Phúc Tạ')).toHaveCount(
      2,
    );
  });
});

test("a teacher's phone can be added, changed, cleared, and searched for (DM-1, release 4)", async () => {
  const start = seed();
  await withApp(async (page) => {
    await openScreen(page, 'Teachers');
    await page.getByRole('button', { name: 'Open Thầy Phúc' }).click();
    const details = (text: string) => page.getByText(text, { exact: true });

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(dialog(page).getByLabel('Phone')).toHaveValue('');
    // Pasted from a document, with non-breaking spaces; it's kept with plain ones.
    await dialog(page).getByLabel('Phone').fill('0912\u00a0345\u00a0678');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(details('Tạ Văn Phúc · phuc@example.com · 0912 345 678 · Both')).toBeVisible();
    await savedFile(page, (f) => f.teachers[0]?.phone === '0912 345 678');

    // The Teachers page finds the phone with or without its spaces.
    await page.getByRole('button', { name: 'Back to teachers' }).click();
    const search = page.getByRole('searchbox', { name: 'Search teachers' });
    await search.fill('0912345678');
    expect(await rowTexts(page)).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Open Thầy Phúc' })).toBeVisible();
    await search.fill('');

    await page.getByRole('button', { name: 'Open Thầy Phúc' }).click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(dialog(page).getByLabel('Phone')).toHaveValue('0912 345 678');
    await dialog(page).getByLabel('Phone').fill('+84 98 765 4321');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(details('Tạ Văn Phúc · phuc@example.com · +84 98 765 4321 · Both')).toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).click();
    await dialog(page).getByLabel('Phone').fill('');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(details('Tạ Văn Phúc · phuc@example.com · Both')).toBeVisible();
    const file = await savedFile(page, (f) => f.teachers[0]?.phone === undefined);
    expect(file.teachers[0]).toEqual(start.teachers[0]);
  });
});

test('Delete asks, leaves the cards with no teacher, and merges identical ones (DM-1)', async () => {
  seed();
  await withApp(async (page) => {
    await openScreen(page, 'Teachers');
    await page.getByRole('button', { name: 'Open Thầy Phúc' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    const question = dialog(page);
    await expect(question.getByRole('heading', { name: 'Delete Thầy Phúc?' })).toBeVisible();
    await expect(
      question.getByText(
        "2 cards use Thầy Phúc. They'll be left with no teacher and stay on the grid where they are.",
      ),
    ).toBeVisible();
    await expect(
      question.getByText(
        "Toán · P101 becomes the same as a card that has no teacher, so the two are merged, keeping both cards' places on the grid.",
      ),
    ).toBeVisible();

    // Keeping the teacher changes nothing.
    await question.getByRole('button', { name: 'Keep the teacher' }).click();
    await expect(question).toBeHidden();
    await expect(title(page)).toHaveText('Thầy Phúc');

    await page.getByRole('button', { name: 'Delete' }).click();
    await dialog(page).getByRole('button', { name: 'Delete teacher' }).click();
    await expect(title(page)).toHaveText('Teachers');
    expect(await rowTexts(page)).toEqual(['Cô Lan | — | — | — | 0 | 0 | 0 |  | ']);
    // The row is gone, so focus goes to Add teacher.
    await expect(page.getByRole('button', { name: 'Add teacher' })).toBeFocused();

    const file = await savedFile(page, (f) => f.teachers.length === 1);
    expect(file.cards).toEqual([
      { id: 'k-toan-none', subjectId: 'toan', teacherId: null, roomId: 'p101' },
      { id: 'k-van-phuc', subjectId: 'van', teacherId: null, roomId: null },
    ]);
    // Every placement is where it was.
    expect(file.placements.map((p) => [p.id, p.cardId, p.classId, p.day, p.block, p.part])).toEqual(
      [
        ['p1', 'k-toan-none', 'c1', 0, 0, 'full'],
        ['p2', 'k-toan-none', 'c2', 0, 0, 'full'],
        ['p3', 'k-van-phuc', 'c1', 1, 1, 'first'],
      ],
    );
  });
});

test('a version 4 timetable opens unchanged, and saves in the current format (R4-3)', async () => {
  const file = seed();
  writeFileSync(join(userData, 'timetable.json'), JSON.stringify({ ...file, schemaVersion: 4 }));
  await withApp(async (page) => {
    await openScreen(page, 'Teachers');
    expect(await rowTexts(page)).toEqual([
      'Thầy Phúc | Tạ Văn Phúc | phuc@example.com | Both | 2 | 3 | 0 |  | ',
      'Cô Lan | — | — | — | 0 | 0 | 0 |  | ',
    ]);
    // A change saves the file in the current format with everything else as it was, the
    // grade list made from the classes (DM-8).
    await page.getByRole('button', { name: 'Open Cô Lan' }).click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await dialog(page).getByLabel('Phone').fill('0987 654 321');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    const saved = await savedFile(page, (f) => f.teachers[1]?.phone !== undefined);
    expect(saved).toEqual({
      ...file,
      schemaVersion: SCHEMA_VERSION,
      grades: gradesOf(file.classes),
      teachers: [file.teachers[0], { ...file.teachers[1], phone: '0987 654 321' }],
    });
  });
});

test('a version 2 timetable opens with its teachers and no conditions', async () => {
  const file = seed();
  const v2 = {
    ...file,
    schemaVersion: 2,
    teachers: file.teachers.map((t) => {
      const old: Partial<Teacher> = { ...t };
      delete old.conditions;
      return old;
    }),
  };
  writeFileSync(join(userData, 'timetable.json'), JSON.stringify(v2));
  await withApp(async (page) => {
    await openScreen(page, 'Teachers');
    expect(await rowTexts(page)).toHaveLength(2);
    await expect(page.getByRole('button', { name: 'Open Thầy Phúc' })).toBeVisible();
  });
});
