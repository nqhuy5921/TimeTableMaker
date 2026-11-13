import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import { savedPath } from './dataFolder';
import { createAppState } from '../../src/domain/appState';
import { addCard } from '../../src/domain/cards';
import { addClass } from '../../src/domain/classes';
import { addRoom, addSubject, addTeacherByShortName, type AddResult } from '../../src/domain/lists';
import type { TimetableFile } from '../../src/domain/model';
import { serializeTimetableFile } from '../../src/shared/fileFormat';

// The Cards page (DM-7, layout spec screen 2d): the whole card pool, with the classes
// each card is on. Made-up names only.

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

function ok(result: AddResult | { ok: true; file: TimetableFile } | { ok: false; error: string }) {
  if (!result.ok) throw new Error(result.error);
  return result.file;
}

/** Toán (Lan, P101) is on 7A1's grid (Monday's first block) and 6A1's (Tuesday's), SH
    lớp (no teacher or room) isn't placed, and Ngữ văn (Lan) is on 7A2's grid. 6A1 is
    added last but comes first in the class bar. */
function seed() {
  let state = createAppState(emptySchool());
  for (const name of ['7A2', '7A1', '6A1']) {
    const result = addClass(state, name, () => name);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  let file = state.file;
  file = ok(addSubject(file, 'Toán', undefined, () => 'math'));
  file = ok(addSubject(file, 'SH lớp', undefined, () => 'homeroom'));
  file = ok(addSubject(file, 'Ngữ văn', undefined, () => 'lit'));
  file = ok(addTeacherByShortName(file, 'Lan', () => 'lan'));
  file = ok(addRoom(file, 'P101', () => 'p101'));
  const fields = (subjectId: string, teacherId: string | null, roomId: string | null) => ({
    subjectId,
    teacherId,
    roomId,
  });
  file = ok(addCard(file, fields('math', 'lan', 'p101'), () => 'k-math'));
  file = ok(addCard(file, fields('homeroom', null, null), () => 'k-home'));
  file = ok(addCard(file, fields('lit', 'lan', null), () => 'k-lit'));
  file = {
    ...file,
    placements: [
      { id: 'p1', cardId: 'k-math', classId: '7A1', day: 0, block: 0, part: 'full' },
      { id: 'p2', cardId: 'k-math', classId: '6A1', day: 1, block: 0, part: 'full' },
      { id: 'p3', cardId: 'k-lit', classId: '7A2', day: 0, block: 1, part: 'full' },
    ],
  };
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(file));
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const openScreen = (page: Page, name: string) => menu(page).getByRole('button', { name }).click();
const table = (page: Page) => page.getByRole('table', { name: 'Cards' });
const rows = (page: Page) =>
  table(page)
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader') });
/** Each row as "subject: classes", for checking order. */
const rowNames = (page: Page) =>
  rows(page).evaluateAll((trs) =>
    trs.map((tr) => `${tr.children[0]!.textContent}: ${tr.children[3]!.textContent}`),
  );
const search = (page: Page) =>
  page.getByRole('searchbox', { name: 'Search classes, subjects, or teachers' });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Subjects and issues' });
const panelCard = (page: Page, subject: string) =>
  panel(page)
    .getByRole('listitem')
    .getByRole('button', { name: new RegExp(`^${subject}`) });
const slot = (page: Page, name: string) =>
  page.getByRole('cell', { name: new RegExp(`^${name}[,:]`) });
const title = (page: Page) => page.getByRole('heading', { level: 1 });

/** `getComputedStyle` in the page. The e2e tests are typed without the DOM library. */
type ComputedStyle = (el: unknown) => Record<string, string>;

async function pickClass(page: Page, name: string) {
  await page.getByRole('radio', { name: `Grade ${name[0]}` }).click();
  await page.getByRole('button', { name: new RegExp(`^${name},`) }).click();
  await expect(title(page)).toHaveText(name);
}

/** Drags a panel card over a target and lets go there. */
async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Card or target is not on screen.');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  // dnd-kit swallows every click for 50ms after a drag ends, so a click straight after
  // this one (on the menu, say) would be lost. A person can't click that fast.
  await page.waitForTimeout(60);
}

test('lists the pool with its classes, searches it, and editing updates every grid', async () => {
  seed();
  await withApp(async (page) => {
    await openScreen(page, 'Cards');
    await expect(menu(page).getByRole('button', { name: 'Cards' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(title(page)).toHaveText('Cards');
    await expect(page.getByText('3 cards')).toBeVisible();
    await expect(table(page).getByRole('columnheader')).toHaveText([
      'Subject',
      'Teacher',
      'Room',
      'Classes',
      'Actions',
    ]);
    // Cards in subject order; a card's classes in class-bar order (6A1 before 7A1).
    await expect
      .poll(() => rowNames(page))
      .toEqual(['Toán: 6A1, 7A1', 'SH lớp: Not placed', 'Ngữ văn: 7A2']);
    await expect(rows(page).nth(0).getByRole('cell')).toHaveText([
      'Lan',
      'P101',
      '6A1, 7A1',
      'EditDelete',
    ]);
    const homeroom = rows(page).nth(1).getByRole('cell');
    await expect(homeroom).toHaveText(['No teacher', 'No room', 'Not placed', 'EditDelete']);
    // "Not placed" is muted, like "No teacher".
    const color = (cell: Locator) =>
      cell.evaluate((el) => {
        const css = (globalThis as unknown as { getComputedStyle: ComputedStyle }).getComputedStyle;
        return css(el).color;
      });
    expect(await color(homeroom.nth(2))).toBe(await color(homeroom.nth(0)));
    expect(await color(homeroom.nth(2))).not.toBe(
      await color(rows(page).nth(0).getByRole('cell').nth(2)),
    );

    // Search by subject, teacher, or class, ignoring accents.
    await search(page).fill('7a2');
    await expect.poll(() => rowNames(page)).toEqual(['Ngữ văn: 7A2']);
    await search(page).fill('6A1');
    await expect.poll(() => rowNames(page)).toEqual(['Toán: 6A1, 7A1']);
    await search(page).fill('van');
    await expect.poll(() => rowNames(page)).toEqual(['Ngữ văn: 7A2']);
    await search(page).fill('lan');
    await expect.poll(() => rowNames(page)).toEqual(['Toán: 6A1, 7A1', 'Ngữ văn: 7A2']);
    await search(page).fill('nobody');
    await expect(page.getByText('No matches')).toBeVisible();
    await search(page).fill('');

    // Edit Toán: a new teacher, no room. The same card form as on the timetable.
    await page.getByRole('button', { name: 'Edit Toán · Lan · P101' }).click();
    const form = page.getByRole('dialog', { name: 'Edit Toán · Lan · P101' });
    await expect(form.getByLabel('Class')).toHaveCount(0);
    await form.getByLabel('Teacher').selectOption({ label: 'New teacher…' });
    await form.getByLabel('Short name').fill('Hùng');
    await form.getByLabel('Short name').press('Enter');
    await form.getByLabel('Room', { exact: true }).selectOption({ label: 'No room' });
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Toán · Hùng', exact: true })).toBeFocused();
    await expect(rows(page).nth(0).getByRole('cell')).toHaveText([
      'Hùng',
      'No room',
      '6A1, 7A1',
      'EditDelete',
    ]);

    // The timetable screen (on 6A1, the first class) shows the change on both grids.
    await openScreen(page, 'Timetable');
    await expect(title(page)).toHaveText('6A1');
    await expect(panelCard(page, 'Toán')).toContainText('Hùng');
    await expect(slot(page, 'Tuesday periods 1–2')).toHaveAccessibleName(
      'Tuesday periods 1–2, Toán, Hùng',
    );
    await pickClass(page, '7A1');
    await expect(slot(page, 'Monday periods 1–2')).toHaveAccessibleName(
      'Monday periods 1–2, Toán, Hùng',
    );
  });

  const saved = JSON.parse(readFileSync(savedPath(userData), 'utf8'));
  const toan = saved.cards.find((c: { id: string }) => c.id === 'k-math');
  const hung = saved.teachers.find((t: { shortName: string }) => t.shortName === 'Hùng');
  expect(toan).toEqual({ id: 'k-math', subjectId: 'math', teacherId: hung.id, roomId: null });
});

test('Delete names the classes and clears every grid; Add card has no Class field', async () => {
  seed();
  await withApp(async (page) => {
    await openScreen(page, 'Cards');

    // Toán is on 6A1's and 7A1's grids: the question names both. Keeping the card closes
    // the form.
    const deleteToan = page.getByRole('button', { name: 'Delete Toán · Lan · P101' });
    await deleteToan.click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete Toán · Lan · P101?' });
    await expect(confirm).toContainText("It's on 6A1's and 7A1's grids.");
    await confirm.getByRole('button', { name: 'Keep the card' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(deleteToan).toBeFocused();

    await deleteToan.click();
    await confirm.getByRole('button', { name: 'Delete card' }).click();
    await expect.poll(() => rowNames(page)).toEqual(['SH lớp: Not placed', 'Ngữ văn: 7A2']);
    await expect(page.getByRole('button', { name: 'Add card' })).toBeFocused();

    // SH lớp isn't on any grid, and it still asks, since there's no undo.
    await page.getByRole('button', { name: 'Delete SH lớp', exact: true }).click();
    const confirmHomeroom = page.getByRole('alertdialog', { name: 'Delete SH lớp?' });
    await expect(confirmHomeroom).toContainText("It isn't on any grid.");
    await confirmHomeroom.getByRole('button', { name: 'Delete card' }).click();
    await expect.poll(() => rowNames(page)).toEqual(['Ngữ văn: 7A2']);

    // Add card: subject, teacher, and room only. Ngữ văn with Lan in P101 is a new card;
    // a second one the same is refused.
    for (const attempt of [1, 2]) {
      await page.getByRole('button', { name: 'Add card' }).click();
      const form = page.getByRole('dialog', { name: 'Add card' });
      await expect(form.getByLabel('Class')).toHaveCount(0);
      await expect(form.getByLabel('Subject', { exact: true })).toBeFocused();
      await form.getByLabel('Subject', { exact: true }).selectOption({ label: 'Ngữ văn' });
      await form.getByLabel('Teacher').selectOption({ label: 'Lan' });
      await form.getByLabel('Room', { exact: true }).selectOption({ label: 'P101' });
      await form.getByRole('button', { name: 'Add card' }).click();
      if (attempt === 1) {
        await expect(form).toHaveCount(0);
      } else {
        await expect(form.getByRole('alert')).toHaveText(
          "There's already a card for Ngữ văn with Lan in P101.",
        );
        await expect(form.getByLabel('Subject', { exact: true })).toHaveAttribute(
          'aria-invalid',
          'true',
        );
        await form.getByRole('button', { name: 'Cancel', exact: true }).click();
      }
    }
    await expect.poll(() => rowNames(page)).toEqual(['Ngữ văn: Not placed', 'Ngữ văn: 7A2']);

    // Both grids lost Toán.
    await openScreen(page, 'Timetable');
    await expect(slot(page, 'Tuesday periods 1–2')).toHaveAccessibleName(
      'Tuesday periods 1–2, empty',
    );
    await pickClass(page, '7A1');
    await expect(slot(page, 'Monday periods 1–2')).toHaveAccessibleName(
      'Monday periods 1–2, empty',
    );
  });

  const saved = JSON.parse(readFileSync(savedPath(userData), 'utf8'));
  expect(saved.placements.map((p: { id: string }) => p.id)).toEqual(['p3']);
  expect(saved.cards).toEqual([
    { id: 'k-lit', subjectId: 'lit', teacherId: 'lan', roomId: null },
    expect.objectContaining({ subjectId: 'lit', teacherId: 'lan', roomId: 'p101' }),
  ]);
});

test('with no classes, cards can still be added, and the grid takes no drops', async () => {
  await withApp(async (page) => {
    await openScreen(page, 'Cards');
    await expect(page.getByText('No cards yet')).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveCount(0);

    // Add card is there with no classes: a new subject on the spot.
    await page.getByRole('button', { name: 'Add card' }).click();
    const form = page.getByRole('dialog', { name: 'Add card' });
    await form.getByLabel('Subject', { exact: true }).selectOption({ label: 'New subject…' });
    await form.getByLabel('Subject name').fill('Toán');
    await form.getByLabel('Subject name').press('Enter');
    await form.getByRole('button', { name: 'Add card' }).click();
    await expect(form).toHaveCount(0);
    await expect.poll(() => rowNames(page)).toEqual(['Toán: Not placed']);

    // With no class on screen, the panel lists the pool, but a drop changes nothing.
    await openScreen(page, 'Timetable');
    await expect(title(page)).toHaveText('No classes yet');
    await expect(panelCard(page, 'Toán')).toHaveText('ToánNo teacher');
    await dragTo(page, panelCard(page, 'Toán'), slot(page, 'Monday periods 1–2'));
    await expect(slot(page, 'Monday periods 1–2')).toHaveAccessibleName(
      'Monday periods 1–2, empty',
    );
  });

  const saved = JSON.parse(readFileSync(savedPath(userData), 'utf8'));
  expect(saved.cards).toHaveLength(1);
  expect(saved.placements).toEqual([]);
});

test('filters the table by grade and by teacher, with the search', async () => {
  seed();
  await withApp(async (page) => {
    await openScreen(page, 'Cards');
    const grade = page.getByRole('combobox', { name: 'Grade' });
    const teacher = page.getByRole('combobox', { name: 'Teacher' });
    await expect(grade.getByRole('option')).toHaveText([
      'All grades',
      'Grade 6',
      'Grade 7',
      'Not placed',
    ]);
    await expect(teacher.getByRole('option')).toHaveText(['All teachers', 'Lan', 'No teacher']);

    await grade.selectOption({ label: 'Grade 6' });
    await expect.poll(() => rowNames(page)).toEqual(['Toán: 6A1, 7A1']);
    await grade.selectOption({ label: 'Grade 7' });
    await expect.poll(() => rowNames(page)).toEqual(['Toán: 6A1, 7A1', 'Ngữ văn: 7A2']);
    await grade.selectOption({ label: 'Not placed' });
    await expect.poll(() => rowNames(page)).toEqual(['SH lớp: Not placed']);

    await grade.selectOption({ label: 'All grades' });
    await teacher.selectOption({ label: 'Lan' });
    await expect.poll(() => rowNames(page)).toEqual(['Toán: 6A1, 7A1', 'Ngữ văn: 7A2']);
    await teacher.selectOption({ label: 'No teacher' });
    await expect.poll(() => rowNames(page)).toEqual(['SH lớp: Not placed']);

    // Both filters and the search together.
    await teacher.selectOption({ label: 'Lan' });
    await grade.selectOption({ label: 'Grade 7' });
    await search(page).fill('van');
    await expect.poll(() => rowNames(page)).toEqual(['Ngữ văn: 7A2']);
    await grade.selectOption({ label: 'Grade 6' });
    await expect(page.getByText('No card matches “van” with these filters.')).toBeVisible();
    await search(page).fill('');
    await teacher.selectOption({ label: 'No teacher' });
    await expect(page.getByText('No card matches these filters.')).toBeVisible();
  });
});
