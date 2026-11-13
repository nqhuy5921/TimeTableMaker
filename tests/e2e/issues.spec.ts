import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import type { Card, Placement, TeacherCondition, TimetableFile } from '../../src/domain/model';
import { createEmptyTimetable } from '../../src/domain/timetableFile';
import { serializeTimetableFile } from '../../src/shared/fileFormat';

// Issue marks and counts (TC-2, TC-3, TB-1; SYSTEM_DESIGN §9.3). Made-up names only.

let userData: string;

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
});

test.afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

function card(id: string, subjectId: string, teacherId: string | null, roomId: string | null) {
  return { id, subjectId, teacherId, roomId } satisfies Card;
}

function placed(id: string, cardId: string, classId: string, day: number, block: number) {
  return {
    id,
    cardId,
    classId,
    day: day as Placement['day'],
    block: block as Placement['block'],
    part: 'full',
  } satisfies Placement;
}

/** 6A1 and 6A2, with Thầy Phúc teaching Toán in P101 and Tin học in P102. */
function seed(placements: Placement[], conditions: TeacherCondition[] = []) {
  const school: TimetableFile = {
    ...emptySchool(),
    classes: [
      { id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1 },
      { id: 'c2', name: '6A2', grade: 6, track: 'A', section: 2 },
    ],
    subjects: [
      { id: 'math', name: 'Toán', colorKey: 'math' },
      { id: 'tin', name: 'Tin học', colorKey: 'informatics' },
    ],
    teachers: [{ id: 'phuc', shortName: 'Thầy Phúc', conditions }],
    rooms: [
      { id: 'p101', name: 'P101' },
      { id: 'p102', name: 'P102' },
    ],
    cards: [card('k-toan', 'math', 'phuc', 'p101'), card('k-tin', 'tin', 'phuc', 'p102')],
    placements,
  };
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(school));
  // Open on 6A2.
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ selectedClassId: 'c2' }));
}

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

const panel = (page: Page) => page.getByRole('complementary', { name: 'Subjects and issues' });
const panelCard = (page: Page, subject: string) =>
  panel(page)
    .getByRole('listitem')
    .getByRole('button', { name: new RegExp(`^${subject}`) });
const slot = (page: Page, name: string) =>
  page.getByRole('cell', { name: new RegExp(`^${name}[,:]`) });
const placedCard = (page: Page, slotName: string, subject: string) =>
  slot(page, slotName).getByRole('button', { name: new RegExp(`^${subject},`) });
const tile = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Grade 6 classes' }).getByRole('button', {
    name: new RegExp(`^${name},`),
  });
const issuesPill = (page: Page) => page.getByRole('button', { name: /^Issues/ });
const issuesTab = (page: Page) => page.getByRole('tab', { name: /^Issues/ });

/** Drags a card to the middle of a slot. `whileHeld` runs before the drop, with the card
    still over the slot. */
async function dragTo(
  page: Page,
  source: Locator,
  target: Locator,
  whileHeld?: () => Promise<void>,
) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Card or slot is not on screen.');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await whileHeld?.();
  await page.mouse.up();
  // dnd-kit swallows clicks for 50ms after a drag ends.
  await page.waitForTimeout(60);
}

test('a teacher in two classes marks both slots and counts on both tiles, and moving away clears them (TC-2, TC-3, TB-1)', async () => {
  seed([placed('p-toan', 'k-toan', 'c1', 0, 1)]);
  await withApp(async (page) => {
    await expect(tile(page, '6A1')).toHaveAccessibleName('6A1, 2 of 50 periods placed');
    await expect(issuesPill(page)).toHaveText('Issues 0');
    await expect(issuesTab(page)).toHaveText('Issues0');

    // While the card is held over 6A2's Monday 3–4, nothing is marked yet.
    await dragTo(page, panelCard(page, 'Tin học'), slot(page, 'Monday periods 3–4'), async () => {
      await expect(page.getByTestId('tile-errors')).toHaveCount(0);
    });

    // Dropped, Thầy Phúc is in both classes at once.
    const tin = placedCard(page, 'Monday periods 3–4', 'Tin học');
    await expect(tin).toHaveAccessibleName('Tin học, Thầy Phúc · P102, 1 error');
    await expect(tin).toHaveAttribute(
      'title',
      'Tin học · Thầy Phúc · P102\nThầy Phúc is in 6A1 and 6A2 at the same time\n' +
        'Drag to move, right-click to remove',
    );
    await expect(tin.locator('..')).toHaveClass(/has-error/);
    await expect(tile(page, '6A1')).toHaveAccessibleName('6A1, 2 of 50 periods placed, 1 error');
    await expect(tile(page, '6A2')).toHaveAccessibleName('6A2, 2 of 50 periods placed, 1 error');
    await expect(page.getByTestId('tile-errors')).toHaveText(['1', '1']);
    await expect(issuesPill(page)).toHaveText('Issues 1');
    await expect(issuesPill(page)).toHaveClass(/tone-error/);
    await expect(issuesTab(page)).toHaveText('Issues1');

    // 6A1's Toán is marked too.
    await tile(page, '6A1').click();
    await expect(placedCard(page, 'Monday periods 3–4', 'Toán')).toHaveAccessibleName(
      'Toán, Thầy Phúc · P101, 1 error',
    );

    // Moving 6A2's card to Tuesday clears the slots, the tiles, and the counts.
    await tile(page, '6A2').click();
    await dragTo(
      page,
      placedCard(page, 'Monday periods 3–4', 'Tin học'),
      slot(page, 'Tuesday periods 3–4'),
    );
    await expect(placedCard(page, 'Tuesday periods 3–4', 'Tin học')).toHaveAccessibleName(
      'Tin học, Thầy Phúc · P102',
    );
    await expect(page.getByTestId('tile-errors')).toHaveCount(0);
    await expect(tile(page, '6A1')).toHaveAccessibleName('6A1, 2 of 50 periods placed');
    await expect(issuesPill(page)).toHaveText('Issues 0');
    await expect(issuesPill(page)).toHaveClass(/tone-none/);
    await tile(page, '6A1').click();
    await expect(placedCard(page, 'Monday periods 3–4', 'Toán')).toHaveAccessibleName(
      'Toán, Thầy Phúc · P101',
    );
  });
});

test('a warning shows amber, and a broken condition shows on the teacher screens (TC-3)', async () => {
  seed(
    [
      // Toán twice on Monday in 6A2 (a warning), and on Friday, Thầy Phúc's day off.
      placed('p-1', 'k-toan', 'c2', 0, 0),
      placed('p-2', 'k-toan', 'c2', 0, 3),
      placed('p-3', 'k-toan', 'c1', 4, 0),
    ],
    [{ id: 'off', on: true, type: 'daysOff', days: [4] }],
  );
  await withApp(async (page) => {
    // 6A2 has only the warning: amber pill and badge.
    await expect(tile(page, '6A2')).toHaveAccessibleName('6A2, 4 of 50 periods placed, 1 warning');
    await expect(page.getByTestId('tile-warnings')).toHaveText('1');
    await expect(page.getByTestId('tile-errors')).toHaveText('1');
    await expect(issuesPill(page)).toHaveText('Issues 1');
    await expect(issuesPill(page)).toHaveClass(/tone-warning/);
    await expect(issuesTab(page).locator('.count-badge')).toHaveClass(/tone-warning/);
    const monday = placedCard(page, 'Monday periods 1–2', 'Toán');
    await expect(monday).toHaveAccessibleName('Toán, Thầy Phúc · P101, 1 warning');
    await expect(monday.locator('..')).toHaveClass(/has-warning/);

    // The Teachers page counts Thầy Phúc's error, and his screen says where it's not met.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: 'Teachers' })
      .click();
    const row = page.getByRole('table', { name: 'Teachers' }).getByRole('row').nth(1);
    await expect(row.getByRole('cell').nth(6)).toHaveText('1');
    await page.getByRole('button', { name: 'Open Thầy Phúc' }).click();
    await expect(page.getByText('Not met in 1 place')).toBeVisible();

    // Switched off, it's met again.
    await page.getByRole('switch', { name: 'Not on Friday' }).click();
    await expect(page.getByText('Not met in 1 place')).toHaveCount(0);
  });
});

// The Issues tab's list (TC-3, TC-4; R2-5).

const issuesPanel = (page: Page) => page.getByRole('tabpanel', { name: /^Issues/ });
const issueRow = (page: Page, message: string) =>
  issuesPanel(page).getByRole('button', { name: new RegExp(`^(Error|Warning): ${message}\\.`) });
const radio = (page: Page, name: string) => issuesPanel(page).getByRole('radio', { name });
const CLASH = 'Thầy Phúc is in 6A1 and 6A2 at the same time';

test('the list follows the grid through a drop, a move, and a removal, and nothing blocks a clash (TC-3, TC-4)', async () => {
  seed([placed('p-toan', 'k-toan', 'c1', 0, 1)]);
  await withApp(async (page) => {
    await issuesTab(page).click();
    await expect(radio(page, '6A2')).toHaveAttribute('aria-checked', 'true');
    await expect(issuesPanel(page).getByText('No issues in 6A2')).toBeVisible();
    await expect(issuesPanel(page)).toContainText('Click an issue to highlight its slots.');

    // Dropping a clash from the Subjects tab is allowed, and the list shows it.
    await page.getByRole('tab', { name: 'Subjects' }).click();
    await dragTo(page, panelCard(page, 'Tin học'), slot(page, 'Monday periods 3–4'));
    await issuesTab(page).click();
    await expect(placedCard(page, 'Monday periods 3–4', 'Tin học')).toBeVisible();
    await expect(issuesPanel(page).getByRole('heading', { name: 'Errors · 1' })).toBeVisible();
    // A word joiner either side of each dash keeps "3–4" on one line (R2-7 review).
    await expect(issueRow(page, CLASH)).toContainText(
      '6A1, 6A2 · Monday · Periods 3\u2060–\u20604',
    );
    await expect(issueRow(page, CLASH)).toHaveAccessibleName(
      `Error: ${CLASH}. 6A1, 6A2 · Monday · Periods 3–4`,
    );
    await expect(radio(page, 'Errors 1')).toBeVisible();

    // Moved away, it's gone; dropped back and removed, gone again.
    await dragTo(
      page,
      placedCard(page, 'Monday periods 3–4', 'Tin học'),
      slot(page, 'Tuesday periods 3–4'),
    );
    await expect(issuesPanel(page).getByText('No issues in 6A2')).toBeVisible();
    await dragTo(
      page,
      placedCard(page, 'Tuesday periods 3–4', 'Tin học'),
      slot(page, 'Monday periods 3–4'),
    );
    await expect(issueRow(page, CLASH)).toBeVisible();
    await placedCard(page, 'Monday periods 3–4', 'Tin học').click({ button: 'right' });
    await expect(issuesPanel(page).getByText('No issues in 6A2')).toBeVisible();
  });
});

test('clicking an issue spotlights its slots, and Show 6A1 switches class keeping it selected (TC-3)', async () => {
  seed([
    placed('p-toan', 'k-toan', 'c1', 0, 1),
    placed('p-tin', 'k-tin', 'c2', 0, 1),
    placed('p-other', 'k-tin', 'c2', 2, 0),
  ]);
  await withApp(async (page) => {
    await issuesTab(page).click();
    const row = issueRow(page, CLASH);
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    const tin = placedCard(page, 'Monday periods 3–4', 'Tin học').locator('..');
    const other = placedCard(page, 'Wednesday periods 1–2', 'Tin học').locator('..');
    await expect(tin).toHaveClass(/is-lit/);
    await expect(other).toHaveClass(/is-dim/);
    // The sticky day header stays above a lit card when the grid scrolls.
    await expect(tin).toHaveCSS('z-index', '1');
    await expect(page.locator('.tt-head').first()).toHaveCSS('z-index', '2');
    await expect(issuesPanel(page)).toContainText('Also in');

    // Show 6A1 switches class; the issue stays selected and lights 6A1's slot.
    await issuesPanel(page).getByRole('button', { name: 'Show 6A1' }).click();
    await expect(page.getByRole('heading', { name: '6A1', level: 1 })).toBeVisible();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await expect(placedCard(page, 'Monday periods 3–4', 'Toán').locator('..')).toHaveClass(
      /is-lit/,
    );
    await expect(issuesPanel(page).getByRole('button', { name: 'Show 6A2' })).toBeVisible();

    // Clicking it again, Escape, and the Subjects tab each clear it.
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'false');
    await expect(placedCard(page, 'Monday periods 3–4', 'Toán').locator('..')).not.toHaveClass(
      /is-lit/,
    );
    await row.click();
    await page.keyboard.press('Escape');
    await expect(row).toHaveAttribute('aria-pressed', 'false');
    await row.click();
    await page.getByRole('tab', { name: 'Subjects' }).click();
    await expect(placedCard(page, 'Monday periods 3–4', 'Toán').locator('..')).not.toHaveClass(
      /is-lit/,
    );
    await issuesTab(page).click();
    await expect(row).toHaveAttribute('aria-pressed', 'false');
  });
});

test('the scope, severity, Teacher, and Check filters work together and stay through a tab, class, or screen switch (TC-3)', async () => {
  seed(
    [
      // 6A2: Toán twice on Monday (a warning), and Thầy Phúc in both classes on Tuesday.
      placed('p-1', 'k-toan', 'c2', 0, 0),
      placed('p-2', 'k-toan', 'c2', 0, 3),
      placed('p-3', 'k-toan', 'c2', 1, 1),
      placed('p-4', 'k-tin', 'c1', 1, 1),
      // 6A1: Friday, his day off.
      placed('p-5', 'k-toan', 'c1', 4, 0),
    ],
    [{ id: 'off', on: true, type: 'daysOff', days: [4] }],
  );
  await withApp(async (page) => {
    await issuesTab(page).click();
    const panel = issuesPanel(page);
    // 6A2: the clash, then the warning.
    await expect(panel.getByRole('heading')).toHaveText(['Errors · 1', 'Warnings · 1']);
    await expect(radio(page, 'All 2')).toBeVisible();
    await expect(issueRow(page, CLASH)).toBeVisible();
    await expect(issueRow(page, '6A2 has Toán twice on Monday')).toBeVisible();

    // All classes adds 6A1's day off.
    await radio(page, 'All classes').click();
    await expect(radio(page, 'All 3')).toBeVisible();
    await expect(radio(page, 'Errors 2')).toBeVisible();
    const dayOff = issueRow(page, 'Thầy Phúc has Friday off but teaches 1 lesson');
    await expect(dayOff).toBeVisible();

    // The day off isn't in 6A2, the class on screen: its row says so and offers 6A1.
    await dayOff.click();
    await expect(panel.locator('.issue-also')).toHaveText(/^Not in 6A2\s*Show 6A1$/);
    await dayOff.click();
    await expect(panel.locator('.issue-also')).toHaveCount(0);

    // Errors only; the counts stay for every severity.
    await radio(page, 'Errors 2').click();
    await expect(panel.getByRole('heading')).toHaveText(['Errors · 2']);
    await expect(radio(page, 'Warnings 1')).toBeVisible();

    // The Check filter narrows it to the day off, and the counts follow.
    await panel.getByRole('combobox', { name: 'Check' }).selectOption('Days off');
    await expect(radio(page, 'All 1')).toBeVisible();
    await expect(panel.getByRole('button', { name: /^Error: Thầy Phúc/ })).toHaveCount(1);

    // Warnings with that check: nothing matches.
    await radio(page, 'Warnings 0').click();
    await expect(panel.getByText('No issues match these filters.')).toBeVisible();

    // The Teacher filter leaves out the warning, which is about no teacher.
    await panel.getByRole('combobox', { name: 'Check' }).selectOption('All checks');
    await panel.getByRole('combobox', { name: 'Teacher' }).selectOption('Thầy Phúc');
    await radio(page, 'All 2').click();
    await expect(panel.getByRole('heading')).toHaveText(['Errors · 2']);

    // A tab switch and a class switch keep it all.
    await page.getByRole('tab', { name: 'Subjects' }).click();
    await tile(page, '6A1').click();
    await issuesTab(page).click();
    await expect(radio(page, 'All classes')).toHaveAttribute('aria-checked', 'true');
    await expect(panel.getByRole('combobox', { name: 'Teacher' })).toHaveValue('phuc');
    await expect(radio(page, 'All 2')).toHaveAttribute('aria-checked', 'true');

    // Back to the class on screen, now 6A1.
    await radio(page, '6A1').click();
    await expect(radio(page, 'All 2')).toBeVisible();
    await expect(issueRow(page, 'Thầy Phúc has Friday off but teaches 1 lesson')).toBeVisible();

    // A visit to another screen keeps it too.
    const menu = page.getByRole('navigation', { name: 'Main' });
    await menu.getByRole('button', { name: 'Teachers' }).click();
    await menu.getByRole('button', { name: 'Timetable' }).click();
    await issuesTab(page).click();
    await expect(radio(page, '6A1')).toHaveAttribute('aria-checked', 'true');
    await expect(panel.getByRole('combobox', { name: 'Teacher' })).toHaveValue('phuc');

    // With the chosen teacher deleted, the filter is back on All teachers.
    await menu.getByRole('button', { name: 'Teachers' }).click();
    await page.getByRole('button', { name: 'Open Thầy Phúc' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete teacher' }).click();
    await menu.getByRole('button', { name: 'Timetable' }).click();
    await issuesTab(page).click();
    const teacher = panel.getByRole('combobox', { name: 'Teacher' });
    await expect(teacher).toHaveValue('');
    await expect(teacher.locator('option:checked')).toHaveText('All teachers');
  });
});

test("with no class on screen the scope is All classes and can't be switched (TC-3)", async () => {
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(createEmptyTimetable()));
  await withApp(async (page) => {
    await issuesTab(page).click();
    await expect(radio(page, 'All classes')).toHaveAttribute('aria-checked', 'true');
    await expect(radio(page, 'All classes')).toBeDisabled();
    await expect(radio(page, 'This class')).toBeDisabled();
    await expect(issuesPanel(page).getByText('No issues', { exact: true })).toBeVisible();
  });
});

test('selecting an issue scrolls its first card into view when the grid scrolls (TC-3)', async () => {
  // Thầy Phúc in both classes on Friday 9–10, the grid's last row.
  seed([placed('p-1', 'k-toan', 'c1', 4, 4), placed('p-2', 'k-tin', 'c2', 4, 4)]);
  await withApp(async (page) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    const frame = page.locator('.tt-frame');
    const card = placedCard(page, 'Friday periods 9–10', 'Tin học').locator('..');
    const inView = async () => {
      const [f, c] = [await frame.boundingBox(), await card.boundingBox()];
      return !!f && !!c && c.y >= f.y + 56 && c.y + c.height <= f.y + f.height;
    };
    expect(await inView()).toBe(false);

    await issuesTab(page).click();
    await issueRow(page, CLASH).click();
    await expect(card).toHaveClass(/is-lit/);
    await expect.poll(inView).toBe(true);
    // The page itself never scrolls.
    expect(await page.evaluate('document.scrollingElement.scrollTop')).toBe(0);
  });
});
