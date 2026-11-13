import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import type { Card, TimetableFile } from '../../src/domain/model';
import { serializeTimetableFile } from '../../src/shared/fileFormat';

// The card panel's search and grouping (DM-7, TB-3). Made-up names only.

let userData: string;

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
});

test.afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

function card(id: string, subjectId: string, teacherId: string | null): Card {
  return { id, subjectId, teacherId, roomId: null };
}

const school: TimetableFile = {
  ...emptySchool(),
  classes: [
    { id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1 },
    { id: 'c2', name: '6A2', grade: 6, track: 'A', section: 2 },
  ],
  subjects: [
    { id: 'math', name: 'Toán', colorKey: 'math' },
    { id: 'lit', name: 'Ngữ văn', colorKey: 'literature' },
    { id: 'geo', name: 'Địa lý', colorKey: 'geography' },
    { id: 'home', name: 'SH lớp', colorKey: 'homeroom' },
  ],
  teachers: [
    { id: 'mai', shortName: 'Cô Mai', conditions: [] },
    { id: 'binh', shortName: 'Thầy Bình', conditions: [] },
  ],
  cards: [
    card('k1', 'math', 'mai'),
    card('k2', 'lit', 'binh'),
    card('k3', 'geo', 'mai'),
    card('k4', 'home', null),
  ],
};

async function withApp(run: (page: Page) => Promise<void>) {
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(school));
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
const cardNames = (page: Page) => panel(page).locator('.subject-card-name');
const headings = (page: Page) => panel(page).getByRole('heading', { level: 3 });
const search = (page: Page) => panel(page).getByLabel('Search subjects or teachers');

test('searches cards ignoring accents and groups them by subject or teacher', async () => {
  await withApp(async (page) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A1');
    // Grouped by subject: one list in subject order, no headings.
    await expect(cardNames(page)).toHaveText(['Toán', 'Ngữ văn', 'Địa lý', 'SH lớp']);
    await expect(headings(page)).toHaveCount(0);

    // "toan" finds Toán, "dia" finds Địa lý, and a teacher's name finds their cards.
    await search(page).fill('toan');
    await expect(cardNames(page)).toHaveText(['Toán']);
    await search(page).fill('DIA');
    await expect(cardNames(page)).toHaveText(['Địa lý']);
    await search(page).fill('co mai');
    await expect(cardNames(page)).toHaveText(['Toán', 'Địa lý']);
    await search(page).fill('hóa học');
    await expect(cardNames(page)).toHaveCount(0);
    await expect(panel(page).getByText('No matches')).toBeVisible();
    // Add subject stays, since the pool does have cards.
    await expect(panel(page).getByRole('button', { name: 'Add subject' })).toBeVisible();
    await search(page).fill('');

    // Grouped by teacher: a sticky heading per teacher, no teacher last.
    await panel(page).getByRole('radio', { name: 'Teacher' }).click();
    await expect(headings(page)).toHaveText(['Cô Mai', 'Thầy Bình', 'No teacher']);
    await expect(
      panel(page).getByRole('region', { name: 'Cô Mai' }).locator('.subject-card-name'),
    ).toHaveText(['Toán', 'Địa lý']);
    await expect(headings(page).first()).toHaveCSS('position', 'sticky');

    await search(page).fill('van');
    await expect(headings(page)).toHaveText(['Thầy Bình']);
    await expect(cardNames(page)).toHaveText(['Ngữ văn']);

    // The search, grouping, and tab survive switching to Issues and back.
    await panel(page)
      .getByRole('tab', { name: /Issues/ })
      .click();
    await expect(search(page)).toBeHidden();
    await panel(page).getByRole('tab', { name: 'Subjects' }).click();
    await expect(search(page)).toHaveValue('van');
    await expect(panel(page).getByRole('radio', { name: 'Teacher' })).toBeChecked();
    await expect(headings(page)).toHaveText(['Thầy Bình']);

    // And switching class: the same pool, with the same search and grouping.
    await page.getByRole('button', { name: /^6A2,/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A2');
    await expect(panel(page).getByRole('tab', { name: 'Subjects' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(search(page)).toHaveValue('van');
    await expect(headings(page)).toHaveText(['Thầy Bình']);
    await expect(cardNames(page)).toHaveText(['Ngữ văn']);

    // And a visit to the Cards page (asked for on 2026-10-21).
    const menu = page.getByRole('navigation', { name: 'Main' });
    await menu.getByRole('button', { name: 'Cards' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cards');
    await menu.getByRole('button', { name: 'Timetable' }).click();
    await expect(search(page)).toHaveValue('van');
    await expect(panel(page).getByRole('radio', { name: 'Teacher' })).toBeChecked();
    await expect(cardNames(page)).toHaveText(['Ngữ văn']);
  });
});
