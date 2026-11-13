import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exampleSchool } from '../../src/domain/exampleSchool';
import { serializeTimetableFile } from '../../src/shared/fileFormat';
import { profileFolder, savedPath, unlockProfiles } from './dataFolder';

// Fixes from the release 1 review (R1-9): the window never leaves the app, a failed open
// shows a screen instead of a blank window, a missing timetable next to a backup asks
// first, and the segmented controls work from the keyboard.

let userData: string;

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
});

test.afterEach(() => {
  unlockProfiles(userData);
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

const write = (name: string, text: string) => writeFileSync(join(userData, name), text);
const title = (page: Page) => page.getByRole('heading', { level: 1 });

test('a dropped file or link never replaces the app', async () => {
  write('timetable.json', serializeTimetableFile(exampleSchool));
  write('dropped.html', '<h1>Not the app</h1>');
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    const page = await app.firstWindow();
    await expect(title(page)).toHaveText('6A1');
    // What dropping a file on the window does. (Typed loosely: no DOM types here.)
    await page.evaluate(
      (href) => {
        (globalThis as unknown as { location: { href: string } }).location.href = href;
      },
      `file://${join(userData, 'dropped.html')}`,
    );
    await page.waitForTimeout(500);
    // Read through Electron: Playwright loses the page's context after the navigation is
    // cancelled, though the page itself is unchanged.
    const shown = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScript(
        `[location.href, document.querySelector('h1')?.textContent]`,
      ),
    );
    expect(shown).toEqual([expect.stringMatching(/renderer\/index\.html$/), '6A1']);
  } finally {
    await app.close();
  }
});

test('a failed open shows a screen with Try again instead of a blank window', async () => {
  const damaged = '{"schemaVersion": 1, "classes": [';
  write('timetable.json', damaged);
  write('timetable.json.bak', serializeTimetableFile(exampleSchool));
  await withApp(async (page) => {
    await expect(title(page)).toHaveText("Your timetable couldn't be opened");

    // The folder can't be written, so the damaged file can't be copied aside.
    chmodSync(profileFolder(userData), 0o555);
    await page.getByRole('button', { name: 'Open the backup' }).click();
    await expect(title(page)).toHaveText('Something went wrong');
    await expect(page.getByText(/EACCES/)).toBeVisible();
    expect(readFileSync(savedPath(userData), 'utf8')).toBe(damaged);

    // Once it can, Try again goes back to the damaged-file screen, and the backup opens.
    chmodSync(profileFolder(userData), 0o755);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(title(page)).toHaveText("Your timetable couldn't be opened");
    await page.getByRole('button', { name: 'Open the backup' }).click();
    await expect(title(page)).toHaveText('6A1');
  });
});

test('a missing timetable next to a backup asks before starting empty', async () => {
  const backup = serializeTimetableFile(exampleSchool);
  write('timetable.json.bak', backup);
  await withApp(async (page) => {
    await expect(title(page)).toHaveText("Your timetable couldn't be opened");
    await expect(page.getByText(/The saved timetable file is missing/)).toBeVisible();
    await expect(page.getByText(/copy of the damaged file/)).toHaveCount(0);
    expect(readFileSync(savedPath(userData, 'timetable.json.bak'), 'utf8')).toBe(backup);
    await page.getByRole('button', { name: 'Open the backup' }).click();
    await expect(title(page)).toHaveText('6A1');
    await expect(page.getByTestId('placed-count')).toHaveText('18/50');
  });
});

test('the grade and Group by controls work with the arrow keys', async () => {
  write('timetable.json', serializeTimetableFile(exampleSchool));
  await withApp(async (page) => {
    const grades = page.getByRole('radiogroup', { name: 'Grade' });
    const grade = (n: number) => grades.getByRole('radio', { name: `Grade ${n}` });
    await expect(title(page)).toHaveText('6A1');

    // Only the chosen option is a Tab stop.
    await expect(grades.locator('[tabindex="0"]')).toHaveText(['Grade 6']);
    await grade(6).focus();
    await page.keyboard.press('ArrowRight');
    await expect(grade(7)).toBeFocused();
    await expect(grade(7)).toBeChecked();
    await expect(page.getByRole('group', { name: 'Grade 7 classes' })).toBeVisible();
    await page.keyboard.press('End');
    await expect(grade(9)).toBeChecked();
    await page.keyboard.press('ArrowRight');
    await expect(grade(6)).toBeChecked();
    await page.keyboard.press('ArrowLeft');
    await expect(grade(9)).toBeFocused();

    const groupBy = page.getByRole('radiogroup', { name: 'Group by' });
    await groupBy.getByRole('radio', { name: 'Subject' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(groupBy.getByRole('radio', { name: 'Teacher' })).toBeChecked();
    await expect(page.getByRole('heading', { name: 'Cô Ngân', level: 3 })).toBeVisible();
  });
});
