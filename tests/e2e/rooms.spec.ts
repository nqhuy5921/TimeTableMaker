import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import { savedPath } from './dataFolder';
import type { TimetableFile } from '../../src/domain/model';
import { serializeTimetableFile } from '../../src/shared/fileFormat';
import { listRowTexts } from './listPage';

// The Rooms page (DM-3, release 3). Made-up names only.

/** Three rooms. P101 has Thầy Phúc's Toán, placed in 6A1, and Cô Lan's Toán, placed in 6A2;
    Thầy Phúc also has a Toán in no room, which his P101 card merges into when P101 goes.
    P102 and Phòng Lab have no cards. */
function seedSchool(userData: string): void {
  const file: TimetableFile = {
    ...emptySchool(),
    subjects: [{ id: 'toan', name: 'Toán', colorKey: 'math' }],
    teachers: [
      { id: 'phuc', shortName: 'Thầy Phúc', conditions: [] },
      { id: 'lan', shortName: 'Cô Lan', conditions: [] },
    ],
    rooms: [
      { id: 'p101', name: 'P101' },
      { id: 'p102', name: 'P102' },
      { id: 'lab', name: 'Phòng Lab' },
    ],
    classes: [
      { id: 'c2', name: '6A2', grade: 6, track: 'A', section: 2 },
      { id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1 },
    ],
    cards: [
      { id: 'k1', subjectId: 'toan', teacherId: 'phuc', roomId: 'p101' },
      { id: 'k2', subjectId: 'toan', teacherId: 'phuc', roomId: null },
      { id: 'k3', subjectId: 'toan', teacherId: 'lan', roomId: 'p101' },
    ],
    placements: [
      { id: 'p1', cardId: 'k1', classId: 'c1', day: 0, block: 0, part: 'full' },
      { id: 'p2', cardId: 'k3', classId: 'c2', day: 1, block: 0, part: 'full' },
    ],
  };
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(file));
}

async function withSchool(run: (page: Page, userData: string) => Promise<void>) {
  const userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
  seedSchool(userData);
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    await run(await app.firstWindow(), userData);
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
}

const openScreen = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();

function savedFile(userData: string): TimetableFile {
  return JSON.parse(readFileSync(savedPath(userData), 'utf8')) as TimetableFile;
}

test('the Rooms page lists rooms with their cards and classes and searches them (DM-3)', async () => {
  await withSchool(async (page) => {
    await openScreen(page, 'Rooms');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rooms');
    await expect(page.getByText('3 rooms')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Rooms' }).getByRole('columnheader')).toHaveText([
      'Room',
      'Cards',
      'Classes',
      'Actions',
    ]);
    await expect
      .poll(() => listRowTexts(page, 'Rooms'))
      .toEqual(['P101 | 2 | 6A1, 6A2', 'P102 | 0 | Not used', 'Phòng Lab | 0 | Not used']);

    // The search matches the room name, ignoring case and accents.
    const search = page.getByRole('searchbox', { name: 'Search rooms' });
    await search.fill('phong');
    await expect.poll(() => listRowTexts(page, 'Rooms')).toEqual(['Phòng Lab | 0 | Not used']);
    await search.fill('p1');
    await expect.poll(() => listRowTexts(page, 'Rooms')).toHaveLength(2);
    await search.fill('nowhere');
    await expect(page.getByText('No room matches “nowhere”.')).toBeVisible();

    // The search starts empty on the next visit.
    await openScreen(page, 'Timetable');
    await openScreen(page, 'Rooms');
    await expect(page.getByRole('searchbox', { name: 'Search rooms' })).toHaveValue('');
  });
});

test('Add room and Edit keep names unique, and a rename shows on the grid (DM-3)', async () => {
  await withSchool(async (page, userData) => {
    await openScreen(page, 'Rooms');
    await page.getByRole('button', { name: 'Add room' }).click();
    const add = page.getByRole('dialog', { name: 'Add room' });
    await expect(add.getByLabel('Name')).toBeFocused();
    await add.getByRole('button', { name: 'Add room' }).click();
    await expect(add.getByRole('alert')).toHaveText('Enter a room name.');
    await add.getByLabel('Name').fill('p102');
    await add.getByRole('button', { name: 'Add room' }).click();
    await expect(add.getByRole('alert')).toHaveText("There's already a room called P102.");
    await add.getByLabel('Name').fill('P201');
    await add.getByRole('button', { name: 'Add room' }).click();
    await expect(add).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add room' })).toBeFocused();
    await expect.poll(() => listRowTexts(page, 'Rooms')).toContain('P201 | 0 | Not used');
    await expect
      .poll(() => savedFile(userData).rooms.map((r) => r.name))
      .toEqual(['P101', 'P102', 'Phòng Lab', 'P201']);

    // Renaming keeps the room's cards, which show the new name on the grid.
    await page.getByRole('button', { name: 'Edit P101' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit P101' });
    await expect(edit.getByLabel('Name')).toHaveValue('P101');
    await edit.getByLabel('Name').fill('P105');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit P105' })).toBeFocused();
    await expect.poll(() => listRowTexts(page, 'Rooms')).toContain('P105 | 2 | 6A1, 6A2');

    await openScreen(page, 'Timetable');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A1');
    await expect(page.getByTestId('placed-card')).toContainText('P105');
  });
});

test('Delete leaves cards with no room, merging identical ones, after asking (DM-3)', async () => {
  await withSchool(async (page, userData) => {
    await openScreen(page, 'Rooms');

    // A room with cards: how many, how many placements, and the card that merges.
    await page.getByRole('button', { name: 'Delete P101' }).click();
    const question = page.getByRole('dialog', { name: 'Delete P101?' });
    await expect(question).toContainText(
      "2 cards use P101, on the grid 2 times. They'll be left with no room and stay on the grid where they are.",
    );
    await expect(question).toContainText(
      "Toán · Thầy Phúc becomes the same as a card that has no room, so the two are merged, keeping both cards' places on the grid.",
    );
    await expect(question.getByRole('button', { name: 'Keep the room' })).toBeFocused();
    await question.getByRole('button', { name: 'Keep the room' }).click();
    await expect(question).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete P101' })).toBeFocused();
    await expect.poll(() => listRowTexts(page, 'Rooms')).toHaveLength(3);

    await page.getByRole('button', { name: 'Delete P101' }).click();
    await question.getByRole('button', { name: 'Delete room' }).click();
    await expect(question).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add room' })).toBeFocused();
    await expect
      .poll(() => listRowTexts(page, 'Rooms'))
      .toEqual(['P102 | 0 | Not used', 'Phòng Lab | 0 | Not used']);
    await expect
      .poll(() => savedFile(userData).cards)
      .toEqual([
        { id: 'k2', subjectId: 'toan', teacherId: 'phuc', roomId: null },
        { id: 'k3', subjectId: 'toan', teacherId: 'lan', roomId: null },
      ]);
    // Both placements stay in their slots; Thầy Phúc's points at the card it merged into.
    expect(savedFile(userData).placements.map((p) => [p.id, p.cardId])).toEqual([
      ['p1', 'k2'],
      ['p2', 'k3'],
    ]);

    // A room nothing uses only asks to confirm.
    await page.getByRole('button', { name: 'Delete Phòng Lab' }).click();
    const plain = page.getByRole('dialog', { name: 'Delete Phòng Lab?' });
    await expect(plain).toContainText('Nothing uses Phòng Lab.');
    await expect(plain).toContainText("This can't be undone.");
    await plain.getByRole('button', { name: 'Delete room' }).click();
    await expect(page.getByText('1 room', { exact: true })).toBeVisible();

    // The grid still has Thầy Phúc's Toán in 6A1, now with no room.
    await openScreen(page, 'Timetable');
    await expect(page.getByTestId('placed-card')).toHaveCount(1);
    await expect(page.getByTestId('placed-card')).toContainText('Thầy Phúc');
    await expect(page.getByTestId('placed-card')).not.toContainText('P101');
  });
});
