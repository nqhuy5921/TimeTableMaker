import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import { savedPath } from './dataFolder';
import type { Card, TimetableFile } from '../../src/domain/model';
import { serializeTimetableFile } from '../../src/shared/fileFormat';

// Dragging cards onto the grid (TB-4, TB-2, DM-7). Made-up names only.

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
const summary = (page: Page) => page.getByRole('region', { name: 'Periods per subject' });

// The top third of a block takes its first half, the middle third the block, the bottom
// third its second half.
const HEIGHTS = { top: 1 / 6, middle: 1 / 2, bottom: 5 / 6 };

/** Picks a panel card up and moves it over a slot, without letting go. */
async function dragOver(page: Page, source: Locator, target: Locator, where: keyof typeof HEIGHTS) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Card or slot is not on screen.');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * HEIGHTS[where], { steps: 10 });
}

async function dragTo(page: Page, subject: string, target: string, where: keyof typeof HEIGHTS) {
  await dragOver(page, panelCard(page, subject), slot(page, target), where);
  await page.mouse.up();
  // dnd-kit swallows every click for 50ms after a drag ends, so a click straight after
  // this one (on the menu, say) would be lost. A person can't click that fast.
  await page.waitForTimeout(60);
}

test('drops cards as full or half blocks, replacing what was there', async () => {
  await withApp(async (page) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A1');
    // Cards are drag sources, but a click still opens the card form.
    await panelCard(page, 'SH lớp').click();
    await expect(page.getByRole('dialog', { name: 'Edit SH lớp' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Toán on the middle of two blocks fills them: 4 periods of Toán.
    await dragTo(page, 'Toán', 'Monday periods 1–2', 'middle');
    await expect(slot(page, 'Monday periods 1–2')).toHaveAccessibleName(
      'Monday periods 1–2, Toán, Cô Mai · P201',
    );
    await dragTo(page, 'Toán', 'Tuesday periods 3–4', 'middle');
    await expect(slot(page, 'Tuesday periods 3–4')).toHaveAccessibleName(
      'Tuesday periods 3–4, Toán, Cô Mai · P201',
    );
    await expect(summary(page).getByRole('listitem')).toHaveText(['Toán4']);
    await expect(summary(page).getByLabel('Toán: 4 periods')).toBeVisible();
    await expect(page.getByTestId('placed-count')).toHaveText('4/50');
    await expect(page.getByTestId('summary-total')).toHaveText('4/50');
    // The card stays in the panel: it can go on the grid as often as needed.
    await expect(panelCard(page, 'Toán')).toBeVisible();

    // While dragging over the top third, the preview covers the top half.
    const wednesday = slot(page, 'Wednesday periods 1–2');
    await dragOver(page, panelCard(page, 'SH lớp'), wednesday, 'top');
    await expect(wednesday.locator('.tt-drop-preview-first')).toBeVisible();
    await expect(wednesday.locator('.tt-drop-preview-full')).toHaveCount(0);
    await page.mouse.up();
    await expect(wednesday.locator('.tt-drop-preview-first')).toHaveCount(0);

    // SH lớp took the top half; GDPC on the bottom half shares the block.
    await expect(wednesday).toHaveAccessibleName(
      'Wednesday periods 1–2: period 1 SH lớp, No teacher; period 2 empty',
    );
    await dragTo(page, 'GDPC', 'Wednesday periods 1–2', 'bottom');
    await expect(wednesday).toHaveAccessibleName(
      'Wednesday periods 1–2: period 1 SH lớp, No teacher; period 2 GDPC, No teacher',
    );
    await expect(page.getByTestId('placed-count')).toHaveText('6/50');

    // Ngữ văn on Monday's filled block replaces Toán.
    await dragTo(page, 'Ngữ văn', 'Monday periods 1–2', 'middle');
    await expect(slot(page, 'Monday periods 1–2')).toHaveAccessibleName(
      'Monday periods 1–2, Ngữ văn, Cô Mai',
    );
    await expect(summary(page).getByRole('listitem')).toHaveText([
      'Toán2',
      'Ngữ văn2',
      'SH lớp1',
      'GDPC1',
    ]);
    await expect(page.getByTestId('placed-count')).toHaveText('6/50');

    // A full block dropped on two halves replaces both.
    await dragTo(page, 'Toán', 'Wednesday periods 1–2', 'middle');
    await expect(wednesday).toHaveAccessibleName('Wednesday periods 1–2, Toán, Cô Mai · P201');
    await expect(page.getByTestId('placed-count')).toHaveText('6/50');

    await dragTo(page, 'GDPC', 'Thursday periods 1–2', 'middle');
    await expect(page.getByTestId('placed-count')).toHaveText('8/50');

    // Dropping outside the grid changes nothing.
    await dragOver(
      page,
      panelCard(page, 'SH lớp'),
      page.getByRole('heading', { level: 1 }),
      'middle',
    );
    await page.mouse.up();
    await expect(page.getByTestId('placed-count')).toHaveText('8/50');
  });

  // Placements are saved (TB-7).
  const saved = JSON.parse(readFileSync(savedPath(userData), 'utf8'));
  expect(
    saved.placements.map((p: { cardId: string; day: number; block: number; part: string }) =>
      [p.cardId, p.day, p.block, p.part].join(' '),
    ),
  ).toEqual(['k-math 1 1 full', 'k-lit 0 0 full', 'k-math 2 0 full', 'k-gdpc 3 0 full']);
});
