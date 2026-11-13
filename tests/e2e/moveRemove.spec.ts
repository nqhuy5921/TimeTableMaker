import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import { savedPath } from './dataFolder';
import type { Card, Placement, TimetableFile } from '../../src/domain/model';
import { serializeTimetableFile } from '../../src/shared/fileFormat';

// Moving and removing placed cards (TB-5), by mouse and by keyboard. Made-up names only.

let userData: string;

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(school));
});

test.afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

function card(id: string, subjectId: string, teacherId: string | null, roomId: string | null) {
  return { id, subjectId, teacherId, roomId } satisfies Card;
}

function placed(id: string, cardId: string, day: number, block: number, part: Placement['part']) {
  return {
    id,
    cardId,
    classId: 'c1',
    day: day as Placement['day'],
    block: block as Placement['block'],
    part,
  } satisfies Placement;
}

/** 6A1 with Toán on Monday 1–2, Ngữ văn on Tuesday 3–4, and SH lớp and GDPC sharing
    Wednesday 1–2: 6 periods placed. */
const school: TimetableFile = {
  ...emptySchool(),
  classes: [{ id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1 }],
  subjects: [
    { id: 'math', name: 'Toán', colorKey: 'math' },
    { id: 'lit', name: 'Ngữ văn', colorKey: 'literature' },
    { id: 'home', name: 'SH lớp', colorKey: 'homeroom' },
    { id: 'gdpc', name: 'GDPC', colorKey: 'homeroom' },
  ],
  teachers: [{ id: 'mai', shortName: 'Cô Mai', conditions: [] }],
  rooms: [{ id: 'p201', name: 'P201' }],
  cards: [
    card('k-math', 'math', 'mai', 'p201'),
    card('k-lit', 'lit', 'mai', null),
    card('k-home', 'home', null, null),
    card('k-gdpc', 'gdpc', null, null),
  ],
  placements: [
    placed('p-math', 'k-math', 0, 0, 'full'),
    placed('p-lit', 'k-lit', 1, 1, 'full'),
    placed('p-home', 'k-home', 2, 0, 'first'),
    placed('p-gdpc', 'k-gdpc', 2, 0, 'second'),
  ],
};

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
/** The drag handle of a card on the grid. */
const placedCard = (page: Page, slotName: string, subject: string) =>
  slot(page, slotName).getByRole('button', { name: new RegExp(`^${subject},`) });
const summary = (page: Page) => page.getByRole('region', { name: 'Periods per subject' });
const placedCount = (page: Page) => page.getByTestId('placed-count');

// The top third of a block takes its first half, the middle third the block, the bottom
// third its second half.
const HEIGHTS = { top: 1 / 6, middle: 1 / 2, bottom: 5 / 6 };

async function dragTo(page: Page, source: Locator, target: Locator, where: keyof typeof HEIGHTS) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Card or slot is not on screen.');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * HEIGHTS[where], { steps: 10 });
  await page.mouse.up();
  // dnd-kit swallows every click for 50ms after a drag ends, so a click straight after
  // this one (on the menu, say) would be lost. A person can't click that fast.
  await page.waitForTimeout(60);
}

function savedPlacements(): string[] {
  const saved = JSON.parse(readFileSync(savedPath(userData), 'utf8'));
  return saved.placements.map((p: Placement) => [p.id, p.cardId, p.day, p.block, p.part].join(' '));
}

test('moves and removes placed cards with the mouse', async () => {
  await withApp(async (page) => {
    await expect(placedCount(page)).toHaveText('6/50');

    // Toán moves to Thursday's empty block; Monday empties and nothing is counted twice.
    await dragTo(
      page,
      placedCard(page, 'Monday periods 1–2', 'Toán'),
      slot(page, 'Thursday periods 1–2'),
      'middle',
    );
    await expect(slot(page, 'Monday periods 1–2')).toHaveAccessibleName(
      'Monday periods 1–2, empty',
    );
    await expect(slot(page, 'Thursday periods 1–2')).toHaveAccessibleName(
      'Thursday periods 1–2, Toán, Cô Mai · P201',
    );
    await expect(placedCount(page)).toHaveText('6/50');

    // Moved onto Wednesday's second half, Toán replaces GDPC there and becomes a half.
    await dragTo(
      page,
      placedCard(page, 'Thursday periods 1–2', 'Toán'),
      slot(page, 'Wednesday periods 1–2'),
      'bottom',
    );
    await expect(slot(page, 'Wednesday periods 1–2')).toHaveAccessibleName(
      'Wednesday periods 1–2: period 1 SH lớp, No teacher; period 2 Toán, Cô Mai · P201',
    );
    await expect(slot(page, 'Thursday periods 1–2')).toHaveAccessibleName(
      'Thursday periods 1–2, empty',
    );
    await expect(summary(page).getByRole('listitem')).toHaveText(['Toán1', 'Ngữ văn2', 'SH lớp1']);
    await expect(placedCount(page)).toHaveText('4/50');
    await expect(page.getByTestId('summary-total')).toHaveText('4/50');

    // A right-click takes a card off the grid straight away, with no × and no menu.
    // The card stays in the panel.
    const tuesday = slot(page, 'Tuesday periods 3–4');
    await tuesday.hover();
    await expect(tuesday.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
    await placedCard(page, 'Tuesday periods 3–4', 'Ngữ văn').click({ button: 'right' });
    await expect(tuesday).toHaveAccessibleName('Tuesday periods 3–4, empty');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(placedCount(page)).toHaveText('2/50');
    await expect(panelCard(page, 'Ngữ văn')).toBeVisible();

    // A right-click on one half leaves the other half alone, at the same size.
    const lowerHalf = placedCard(page, 'Wednesday periods 1–2', 'Toán');
    const lowerBefore = await lowerHalf.boundingBox();
    await placedCard(page, 'Wednesday periods 1–2', 'SH lớp').click({ button: 'right' });
    await expect(slot(page, 'Wednesday periods 1–2')).toHaveAccessibleName(
      'Wednesday periods 1–2: period 1 empty; period 2 Toán, Cô Mai · P201',
    );
    expect(await lowerHalf.boundingBox()).toEqual(lowerBefore);
    await expect(summary(page).getByRole('listitem')).toHaveText(['Toán1']);
    await expect(placedCount(page)).toHaveText('1/50');
  });

  // A moved placement keeps its id; removed ones are gone from the saved file (TB-7).
  expect(savedPlacements()).toEqual(['p-math k-math 2 0 second']);
});

// Keyboard dragging and Delete to remove were dropped on 2026-10-21 at the user's request:
// cards are placed, moved, and removed with the mouse only.
test('the keyboard opens a panel card but no longer drags or removes cards', async () => {
  await withApp(async (page) => {
    await expect(placedCount(page)).toHaveText('6/50');

    // Enter and Space on a panel card both open the card form; neither picks it up.
    for (const key of ['Enter', 'Space']) {
      await panelCard(page, 'Toán').focus();
      await page.keyboard.press(key);
      await expect(page.getByRole('dialog', { name: 'Edit Toán · Cô Mai · P201' })).toBeVisible();
      await expect(panelCard(page, 'Toán')).not.toHaveClass(/is-dragging/);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }

    // Placed cards aren't in the Tab order, and Delete or arrows on one do nothing.
    const toan = placedCard(page, 'Monday periods 1–2', 'Toán');
    await expect(toan).toHaveAttribute('tabindex', '-1');
    await toan.focus();
    for (const key of ['Space', 'ArrowRight', 'Space', 'Delete', 'Backspace']) {
      await page.keyboard.press(key);
    }
    await expect(slot(page, 'Monday periods 1–2')).toHaveAccessibleName(
      'Monday periods 1–2, Toán, Cô Mai · P201',
    );
    await expect(placedCount(page)).toHaveText('6/50');
  });
});
