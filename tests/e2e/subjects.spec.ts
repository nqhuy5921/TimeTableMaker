import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import { savedPath } from './dataFolder';
import type { TimetableFile } from '../../src/domain/model';
import { serializeTimetableFile } from '../../src/shared/fileFormat';
import { listRowTexts } from './listPage';

// The Subjects page (DM-4, release 3). Made-up names only.

/** Three subjects. Toán has Thầy Phúc's card, placed in 6A1, and both teachers' subject
    limits name it (Cô Lan's is switched off). Tin học has a card for each teacher, placed in
    6A1 and 7AA1 three times in all. Địa lý has no cards. */
function seedSchool(userData: string): void {
  const file: TimetableFile = {
    ...emptySchool(),
    subjects: [
      { id: 'toan', name: 'Toán', colorKey: 'math' },
      { id: 'tin', name: 'Tin học', colorKey: 'informatics' },
      { id: 'dia', name: 'Địa lý', colorKey: 'geography' },
    ],
    teachers: [
      {
        id: 'phuc',
        shortName: 'Thầy Phúc',
        conditions: [
          { id: 'l1', on: true, type: 'subjectLimit', subjectId: 'toan', max: 2, per: 'day' },
        ],
      },
      {
        id: 'lan',
        shortName: 'Cô Lan',
        conditions: [
          { id: 'l2', on: false, type: 'subjectLimit', subjectId: 'toan', max: 6, per: 'week' },
        ],
      },
    ],
    classes: [
      { id: 'c7', name: '7AA1', grade: 7, track: 'AA', section: 1 },
      { id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1 },
    ],
    cards: [
      { id: 'k1', subjectId: 'toan', teacherId: 'phuc', roomId: null },
      { id: 'k2', subjectId: 'tin', teacherId: 'lan', roomId: null },
      { id: 'k3', subjectId: 'tin', teacherId: 'phuc', roomId: null },
    ],
    placements: [
      { id: 'p1', cardId: 'k1', classId: 'c1', day: 0, block: 0, part: 'full' },
      { id: 'p2', cardId: 'k2', classId: 'c1', day: 1, block: 0, part: 'full' },
      { id: 'p3', cardId: 'k2', classId: 'c7', day: 0, block: 0, part: 'full' },
      { id: 'p4', cardId: 'k3', classId: 'c7', day: 1, block: 0, part: 'full' },
    ],
  };
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(file));
}

/** Runs the app on the seeded school; `restart` closes it and opens it again on the same
    data folder, returning the new window. */
async function withSchool(
  run: (page: Page, userData: string, restart: () => Promise<Page>) => Promise<void>,
) {
  const userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
  seedSchool(userData);
  const launch = () =>
    electron.launch({ args: ['.'], env: { ...process.env, TTM_USER_DATA: userData } });
  let app = await launch();
  try {
    await run(await app.firstWindow(), userData, async () => {
      await app.close();
      app = await launch();
      return app.firstWindow();
    });
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
}

const openScreen = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();

// The Colors row's radios are hidden behind their pills and swatches, so the tests click
// those, by the title each carries, as a person would.

function savedFile(userData: string): TimetableFile {
  return JSON.parse(readFileSync(savedPath(userData), 'utf8')) as TimetableFile;
}

test('the Subjects page lists subjects in their colors with their cards and searches them (DM-4)', async () => {
  await withSchool(async (page) => {
    await openScreen(page, 'Subjects');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Subjects');
    await expect(page.getByText('3 subjects')).toBeVisible();
    await expect(
      page.getByRole('table', { name: 'Subjects' }).getByRole('columnheader'),
    ).toHaveText(['Subject', 'Cards', 'Actions']);
    await expect
      .poll(() => listRowTexts(page, 'Subjects'))
      .toEqual(['Toán (math) | 1', 'Tin học (informatics) | 2', 'Địa lý (geography) | 0']);

    // The search matches the subject name, ignoring case and accents.
    const search = page.getByRole('searchbox', { name: 'Search subjects' });
    await search.fill('dia');
    await expect.poll(() => listRowTexts(page, 'Subjects')).toEqual(['Địa lý (geography) | 0']);
    await search.fill('TIN');
    await expect.poll(() => listRowTexts(page, 'Subjects')).toEqual(['Tin học (informatics) | 2']);
    await search.fill('nowhere');
    await expect(page.getByText('No subject matches “nowhere”.')).toBeVisible();

    // The search starts empty on the next visit.
    await openScreen(page, 'Timetable');
    await openScreen(page, 'Subjects');
    await expect(page.getByRole('searchbox', { name: 'Search subjects' })).toHaveValue('');
  });
});

test('Add subject and Edit keep names unique, preview the colors, and renames show everywhere (DM-4)', async () => {
  await withSchool(async (page, userData) => {
    await openScreen(page, 'Subjects');
    await page.getByRole('button', { name: 'Add subject' }).click();
    const add = page.getByRole('dialog', { name: 'Add subject' });
    await expect(add.getByLabel('Name', { exact: true })).toBeFocused();
    const preview = add.getByTestId('subject-preview');
    // With no name yet, the preview says "Subject" in the colors it would get.
    await expect(preview.getByTestId('subject-preview-tag')).toHaveText('Subject');
    await expect(add.getByRole('radio', { name: 'From the name' })).toBeChecked();
    await add.getByRole('button', { name: 'Add subject' }).click();
    await expect(add.getByRole('alert')).toHaveText('Enter a subject name.');
    await add.getByLabel('Name', { exact: true }).fill('toán');
    await add.getByRole('button', { name: 'Add subject' }).click();
    await expect(add.getByRole('alert')).toHaveText("There's already a subject called Toán.");

    // The preview shows the name as a tag in the colors it gives, as it's typed.
    await add.getByLabel('Name', { exact: true }).fill('Lịch sử');
    await expect(preview.locator('.subject-tag')).toHaveText('Lịch sử');
    await expect(preview.locator('.subject-tag')).toHaveClass(/subject-history/);
    await add.getByRole('button', { name: 'Add subject' }).click();
    await expect(add).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add subject' })).toBeFocused();
    await expect.poll(() => listRowTexts(page, 'Subjects')).toContain('Lịch sử (history) | 0');
    await expect
      .poll(() => savedFile(userData).subjects.map((s) => [s.name, s.colorKey]))
      .toEqual([
        ['Toán', 'math'],
        ['Tin học', 'informatics'],
        ['Địa lý', 'geography'],
        ['Lịch sử', 'history'],
      ]);

    // Renaming keeps the subject's cards, and the colors follow the new name.
    await page.getByRole('button', { name: 'Edit Tin học' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Tin học' });
    await expect(edit.getByLabel('Name', { exact: true })).toHaveValue('Tin học');
    await expect(edit.getByTestId('subject-preview').locator('.subject-tag')).toHaveClass(
      /subject-informatics/,
    );
    await edit.getByLabel('Name', { exact: true }).fill('Tiếng Anh');
    await expect(edit.getByTestId('subject-preview').locator('.subject-tag')).toHaveClass(
      /subject-english/,
    );
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Tiếng Anh' })).toBeFocused();
    await expect.poll(() => listRowTexts(page, 'Subjects')).toContain('Tiếng Anh (english) | 2');

    // A rename shows in a condition sentence too.
    await page.getByRole('button', { name: 'Edit Toán' }).click();
    await page
      .getByRole('dialog', { name: 'Edit Toán' })
      .getByLabel('Name', { exact: true })
      .fill('Toán học');
    await page
      .getByRole('dialog', { name: 'Edit Toán' })
      .getByRole('button', { name: 'Save' })
      .click();
    await openScreen(page, 'Teachers');
    await page.getByRole('button', { name: 'Open Thầy Phúc' }).click();
    await expect(page.getByText('At most 2 periods of Toán học a day')).toBeVisible();

    // On the grid, 6A1's card shows the new name in its new colors.
    await openScreen(page, 'Timetable');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A1');
    const english = page.getByTestId('placed-card').filter({ hasText: 'Tiếng Anh' });
    await expect(english).toHaveCount(1);
    await expect(english).toHaveClass(/subject-english/);
  });
});

test('Delete asks first and takes the cards, and the subject limits naming it (DM-4)', async () => {
  await withSchool(async (page, userData) => {
    await openScreen(page, 'Subjects');

    // A subject with cards: how many, how often on the grid, and which classes.
    await page.getByRole('button', { name: 'Delete Tin học' }).click();
    const question = page.getByRole('dialog', { name: 'Delete Tin học?' });
    await expect(question).toContainText(
      '2 cards of Tin học are on the grid 3 times, in 6A1 and 7AA1. The cards and their places on the grid are deleted.',
    );
    await expect(question).toContainText("This can't be undone.");
    await expect(question.getByRole('button', { name: 'Keep the subject' })).toBeFocused();
    await question.getByRole('button', { name: 'Keep the subject' }).click();
    await expect(question).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete Tin học' })).toBeFocused();

    await page.getByRole('button', { name: 'Delete Tin học' }).click();
    await question.getByRole('button', { name: 'Delete subject' }).click();
    await expect(question).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add subject' })).toBeFocused();
    await expect
      .poll(() => listRowTexts(page, 'Subjects'))
      .toEqual(['Toán (math) | 1', 'Địa lý (geography) | 0']);
    await expect.poll(() => savedFile(userData).cards.map((c) => c.id)).toEqual(['k1']);
    expect(savedFile(userData).placements.map((p) => p.id)).toEqual(['p1']);

    // A subject nothing uses only asks to confirm.
    await page.getByRole('button', { name: 'Delete Địa lý' }).click();
    const plain = page.getByRole('dialog', { name: 'Delete Địa lý?' });
    await expect(plain).toContainText('Nothing uses Địa lý.');
    await plain.getByRole('button', { name: 'Delete subject' }).click();
    await expect(page.getByText('1 subject', { exact: true })).toBeVisible();

    // 6A1's grid keeps only Thầy Phúc's Toán.
    await openScreen(page, 'Timetable');
    await expect(page.getByTestId('placed-card')).toHaveCount(1);
    await expect(page.getByTestId('placed-card')).toContainText('Toán');

    // Both teachers' subject limits name Toán (Cô Lan's is switched off): the question
    // says they go too, and deleting takes them off the teachers' screens.
    await openScreen(page, 'Subjects');
    await page.getByRole('button', { name: 'Delete Toán' }).click();
    const toan = page.getByRole('dialog', { name: 'Delete Toán?' });
    await expect(toan).toContainText("Thầy Phúc's and Cô Lan's subject limits on Toán go too.");
    await expect(toan.getByRole('button', { name: 'Keep the subject' })).toBeFocused();
    await toan.getByRole('button', { name: 'Delete subject' }).click();
    await expect(page.getByText('No subjects yet')).toBeVisible();
    await expect
      .poll(() => savedFile(userData).teachers.map((t) => t.conditions.length))
      .toEqual([0, 0]);
    await openScreen(page, 'Teachers');
    await page.getByRole('button', { name: 'Open Thầy Phúc' }).click();
    await expect(page.getByText('At most 2 periods of Toán a day')).toHaveCount(0);
  });
});

test('the subject form picks a palette or custom colors, shown everywhere and kept (DM-4, R3-5b)', async () => {
  await withSchool(async (page, userData, restart) => {
    await openScreen(page, 'Subjects');

    // A picked palette: Tin học in Ngữ văn's colors, previewed on the tag and a grid card.
    await page.getByRole('button', { name: 'Edit Tin học' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Tin học' });
    await expect(edit.getByRole('radio', { name: 'From the name' })).toBeChecked();
    await edit.getByTitle("Ngữ văn's colors", { exact: true }).click();
    await expect(edit.getByTestId('subject-preview-tag')).toHaveClass(/subject-literature/);
    await expect(edit.getByTestId('subject-preview-card')).toHaveClass(/subject-literature/);
    await expect(edit.getByTestId('subject-preview-card')).toContainText('Teacher · Room');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toHaveCount(0);
    await expect.poll(() => listRowTexts(page, 'Subjects')).toContain('Tin học (literature) | 2');

    // It stays through a rename.
    await page.getByRole('button', { name: 'Edit Tin học' }).click();
    await expect(edit.getByRole('radio', { name: "Ngữ văn's colors" })).toBeChecked();
    await edit.getByLabel('Name', { exact: true }).fill('Tin');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => listRowTexts(page, 'Subjects')).toContain('Tin (literature) | 2');

    // Custom starts from the colors on show, and a hard-to-read pair gets a note.
    await page.getByRole('button', { name: 'Edit Địa lý' }).click();
    const dia = page.getByRole('dialog', { name: 'Edit Địa lý' });
    await dia.getByTitle('Custom', { exact: true }).click();
    await expect(dia.getByLabel('Background', { exact: true })).toHaveValue(/^#[0-9a-f]{6}$/);
    await dia.getByLabel('Background', { exact: true }).fill('#ffeedd');
    await dia.getByLabel('Text', { exact: true }).fill('#ffddcc');
    await expect(dia.getByText('This text may be hard to read on this background.')).toBeVisible();
    await dia.getByLabel('Text', { exact: true }).fill('#112233');
    await expect(dia.getByText('This text may be hard to read on this background.')).toHaveCount(0);
    await expect(dia.getByTestId('subject-preview-card')).toHaveCSS(
      'background-color',
      'rgb(255, 238, 221)',
    );
    await dia.getByRole('button', { name: 'Save' }).click();
    await expect
      .poll(() => listRowTexts(page, 'Subjects'))
      .toContain('Địa lý (custom #ffeedd #112233) | 0');
    await expect
      .poll(() => savedFile(userData).subjects.find((s) => s.id === 'dia'))
      .toEqual({
        id: 'dia',
        name: 'Địa lý',
        colorKey: 'geography',
        colorSource: 'custom',
        customColors: { bg: '#ffeedd', ink: '#112233' },
      });

    // Custom colors on the grid and in the panel: Toán gets them too.
    await page.getByRole('button', { name: 'Edit Toán' }).click();
    const toan = page.getByRole('dialog', { name: 'Edit Toán' });
    await toan.getByTitle('Custom', { exact: true }).click();
    await toan.getByLabel('Background', { exact: true }).fill('#ffeedd');
    await toan.getByLabel('Text', { exact: true }).fill('#112233');
    await toan.getByRole('button', { name: 'Save' }).click();
    await expect(toan).toHaveCount(0);

    // After a restart, every screen shows the colors chosen.
    page = await restart();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A1');
    const placedToan = page.getByTestId('placed-card').filter({ hasText: 'Toán' });
    await expect(placedToan).toHaveCSS('background-color', 'rgb(255, 238, 221)');
    await expect(placedToan).toHaveCSS('color', 'rgb(17, 34, 51)');
    await expect(page.getByTestId('placed-card').filter({ hasText: 'Tin' }).first()).toHaveClass(
      /subject-literature/,
    );
    const panelToan = page
      .getByRole('complementary', { name: 'Subjects and issues' })
      .getByRole('button', { name: /^Toán/ });
    await expect(panelToan).toHaveCSS('background-color', 'rgb(255, 238, 221)');
    await expect(
      page.getByRole('region', { name: 'Periods per subject' }).getByLabel(/^Toán/),
    ).toHaveCSS('background-color', 'rgb(255, 238, 221)');
    await openScreen(page, 'Cards');
    await expect(
      page.getByRole('table').locator('.subject-tag').filter({ hasText: 'Toán' }),
    ).toHaveCSS('background-color', 'rgb(255, 238, 221)');
    await openScreen(page, 'Subjects');
    await expect
      .poll(() => listRowTexts(page, 'Subjects'))
      .toEqual([
        'Toán (custom #ffeedd #112233) | 1',
        'Tin (literature) | 2',
        'Địa lý (custom #ffeedd #112233) | 0',
      ]);

    // Back to the name's colors, which then follow it.
    await page.getByRole('button', { name: 'Edit Toán' }).click();
    const back = page.getByRole('dialog', { name: 'Edit Toán' });
    await expect(back.getByRole('radio', { name: 'Custom' })).toBeChecked();
    await expect(back.getByLabel('Background', { exact: true })).toHaveValue('#ffeedd');
    await back.getByTitle('From the name', { exact: true }).click();
    await expect(back.getByLabel('Background', { exact: true })).toHaveCount(0);
    await back.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => listRowTexts(page, 'Subjects')).toContain('Toán (math) | 1');
    await expect
      .poll(() => savedFile(userData).subjects[0])
      .toEqual({ id: 'toan', name: 'Toán', colorKey: 'math' });
  });
});
