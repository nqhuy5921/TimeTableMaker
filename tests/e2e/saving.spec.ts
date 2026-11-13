import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import { createAppState } from '../../src/domain/appState';
import { addClass as addClassCommand } from '../../src/domain/classes';
import { serializeTimetableFile } from '../../src/shared/fileFormat';
import { profileFolder, savedPath, unlockProfiles } from './dataFolder';

// Saving (TB-7): each test starts the app on its own data folder with TTM_USER_DATA,
// closes it, and starts it again on the same folder.

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

async function addClass(page: Page, name: string) {
  await page.getByRole('button', { name: 'New class' }).click();
  const dialog = page.getByRole('dialog', { name: 'New class' });
  await dialog.getByLabel('Class name').fill(name);
  await dialog.getByRole('button', { name: 'Add class' }).click();
  await expect(dialog).toHaveCount(0);
}

const title = (page: Page) => page.getByRole('heading', { level: 1 });
const tile = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name},`) });

test('classes are still there after a restart, with the last class on screen', async () => {
  // A timetable with grades 6 to 9 and no classes; a new one has no grades (DM-8).
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(emptySchool()));
  await withApp(async (page) => {
    await addClass(page, '6A1');
    await addClass(page, '6A2');
    await addClass(page, '7B2');
    await page.getByRole('radiogroup', { name: 'Grade' }).getByRole('radio').first().click();
    await tile(page, '6A2').click();
    await expect(title(page)).toHaveText('6A2');
    // Closed right away, inside the half-second wait, so the pending save is finished
    // on the way out.
  });

  await withApp(async (page) => {
    await expect(title(page)).toHaveText('6A2');
    await expect(tile(page, '6A1')).toBeVisible();
    await expect(tile(page, '6A2')).toHaveAttribute('aria-current', 'true');
    await page.getByRole('radiogroup', { name: 'Grade' }).getByRole('radio').nth(1).click();
    await expect(tile(page, '7B2')).toBeVisible();
    await addClass(page, '9BA1');
  });

  // The file on disk has every class, and the backup has the version before.
  const names = (file: string) =>
    JSON.parse(readFileSync(savedPath(userData, file), 'utf8')).classes.map(
      (c: { name: string }) => c.name,
    );
  expect(names('timetable.json')).toEqual(['6A1', '6A2', '7B2', '9BA1']);
  expect(names('timetable.json.bak')).toEqual(['6A1', '6A2', '7B2']);
});

test('a damaged file is left alone, and the backup can be opened instead', async () => {
  const damaged = '{"schemaVersion": 1, "classes": [';
  const result = addClassCommand(createAppState(emptySchool()), '8CE2');
  if (!result.ok) throw new Error(result.error);
  writeFileSync(join(userData, 'timetable.json'), damaged);
  writeFileSync(join(userData, 'timetable.json.bak'), serializeTimetableFile(result.state.file));

  await withApp(async (page) => {
    await expect(title(page)).toHaveText("Your timetable couldn't be opened");
    await expect(page.getByText(/isn't valid JSON/)).toBeVisible();
    expect(readFileSync(savedPath(userData), 'utf8')).toBe(damaged);

    await page.getByRole('button', { name: 'Open the backup' }).click();
    await expect(title(page)).toHaveText('8CE2');
    await addClass(page, '8CE3');
  });

  const setAside = readdirSync(profileFolder(userData)).filter((name) =>
    name.startsWith('timetable.damaged-'),
  );
  expect(setAside).toHaveLength(1);
  expect(readFileSync(savedPath(userData, setAside[0]!), 'utf8')).toBe(damaged);

  await withApp(async (page) => {
    await expect(title(page)).toHaveText('8CE3');
    await expect(tile(page, '8CE2')).toBeVisible();
  });
});

test('with no backup, a damaged file can only be set aside for a new timetable', async () => {
  writeFileSync(join(userData, 'timetable.json'), '[]');

  await withApp(async (page) => {
    await expect(page.getByText("There's no backup to open.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open the backup' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start a new timetable' }).click();
    await expect(title(page)).toHaveText('No classes yet');
  });

  expect(
    readdirSync(profileFolder(userData)).some((name) => name.startsWith('timetable.damaged-')),
  ).toBe(true);
});

test('a failed save drops down a notice that says why, and Try again saves', async () => {
  // Root can write to a read-only folder, so this can only be checked as another user.
  test.skip(process.getuid?.() === 0, 'needs a user that a read-only folder stops');
  // A timetable with grades 6 to 9 and no classes; a new one has no grades (DM-8).
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(emptySchool()));
  await withApp(async (page) => {
    await addClass(page, '6A1');
    const folder = profileFolder(userData);
    await expect.poll(() => readdirSync(folder)).toContain('timetable.json');

    // The profile's folder can't be written to: the next change isn't saved.
    chmodSync(folder, 0o555);
    await addClass(page, '6A2');
    const notice = page.getByRole('alert');
    await expect(notice).toContainText("Your latest changes aren't saved");
    await expect(notice).toContainText(`timetable.json in ${folder} couldn't be written.`);
    await expect(notice).toContainText("They're still here in the app, so keep it open.");
    // It sits over the screen under the header, so nothing on the page moves (in the
    // notice stack it shares with the export notice).
    await expect(page.locator('.notice-stack').filter({ has: notice })).toHaveCSS(
      'position',
      'fixed',
    );

    // A retry that fails again says so; Hide puts it away until the next failure.
    await notice.getByRole('button', { name: 'Try again' }).click();
    await expect(notice).toContainText("Your latest changes still aren't saved (tried 2 times)");
    await notice.getByRole('button', { name: 'Hide' }).click();
    await expect(notice).toHaveCount(0);
    await addClass(page, '6A3');
    await expect(notice).toContainText('(tried 3 times)');

    chmodSync(folder, 0o755);
    await notice.getByRole('button', { name: 'Try again' }).click();
    await expect(notice).toHaveCount(0);
    const saved = JSON.parse(readFileSync(savedPath(userData), 'utf8')) as {
      classes: { name: string }[];
    };
    expect(saved.classes.map((c) => c.name)).toEqual(['6A1', '6A2', '6A3']);
  });
});
