import { _electron as electron, expect, test, type Page } from '@playwright/test';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exampleSchool } from '../../src/domain/exampleSchool';
import type { TimetableFile } from '../../src/domain/model';
import { serializeTimetableFile } from '../../src/shared/fileFormat';
import { appFiles, profileFolder, savedPath, unlockProfiles } from './dataFolder';
import { addGrade, gradesDialog } from './gradesDialog';
import { listRowTexts } from './listPage';

// Profiles (PF-1 to PF-3): each test starts the app on its own data folder with
// TTM_USER_DATA.

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

const title = (page: Page) => page.getByRole('heading', { level: 1 });
const placedCount = (page: Page) => page.getByTestId('placed-count');
const saved = () => JSON.parse(readFileSync(savedPath(userData), 'utf8')) as TimetableFile;

test('a release 3 timetable opens unchanged as the profile "Timetable" (PF-3)', async () => {
  const before = serializeTimetableFile(exampleSchool);
  const settings = `${JSON.stringify({ selectedClassId: 'c-8ce1' })}\n`;
  writeFileSync(join(userData, 'timetable.json'), before);
  writeFileSync(join(userData, 'settings.json'), settings);

  await withApp(async (page) => {
    // The class that was on screen, with its grid as it was.
    await expect(title(page)).toHaveText('8CE1');
    await expect(placedCount(page)).toHaveText('4/50');
  });

  expect(appFiles(userData)).toEqual([
    'profiles',
    'profiles.json',
    'timetable.before-profiles.json',
  ]);
  expect(JSON.parse(readFileSync(join(userData, 'profiles.json'), 'utf8'))).toMatchObject({
    profiles: [{ name: 'Timetable' }],
  });
  expect(readFileSync(join(userData, 'timetable.before-profiles.json'), 'utf8')).toBe(before);
  expect(saved()).toEqual(exampleSchool);
  expect(readdirSync(profileFolder(userData)).sort()).toEqual(['settings.json', 'timetable.json']);

  // Changes go to the profile and are there next time; the copy stays as it was.
  await withApp(async (page) => {
    await expect(title(page)).toHaveText('8CE1');
    await page.getByRole('button', { name: 'New class' }).click();
    const dialog = page.getByRole('dialog', { name: 'New class' });
    await dialog.getByLabel('Class name').fill('6A3');
    await dialog.getByRole('button', { name: 'Add class' }).click();
    await expect(title(page)).toHaveText('6A3');
  });

  expect(saved().classes.map((c) => c.name)).toContain('6A3');
  expect(readFileSync(join(userData, 'timetable.before-profiles.json'), 'utf8')).toBe(before);
  await withApp(async (page) => {
    await expect(title(page)).toHaveText('6A3');
  });
});

test('the first start makes an empty profile named "Timetable" (PF-1)', async () => {
  await withApp(async (page) => {
    await expect(title(page)).toHaveText('No classes yet');
  });
  expect(appFiles(userData)).toEqual(['profiles', 'profiles.json']);
  expect(JSON.parse(readFileSync(join(userData, 'profiles.json'), 'utf8'))).toMatchObject({
    profiles: [{ name: 'Timetable' }],
  });
});

const pill = (page: Page) => page.getByTestId('profile-pill');
const profileRows = (page: Page) => listRowTexts(page, 'Profiles');
const profilesList = () =>
  JSON.parse(readFileSync(join(userData, 'profiles.json'), 'utf8')) as {
    openId: string;
    profiles: { id: string; name: string }[];
  };

async function showProfiles(page: Page) {
  await pill(page).click();
  await expect(title(page)).toHaveText('Profiles');
}

/** Starts from a release 3 folder holding the sample school, with 8CE1 on screen. */
function seedSampleSchool() {
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(exampleSchool));
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ selectedClassId: 'c-8ce1' }));
}

test('the profile screen makes, copies, renames, opens, and deletes profiles (PF-2)', async () => {
  seedSampleSchool();
  const cards = exampleSchool.cards.length;

  await withApp(async (page) => {
    // The header names the open profile, and its pill opens the profile screen.
    await expect(pill(page)).toHaveText('Timetable');
    await showProfiles(page);
    await expect(pill(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('1 profile', { exact: true })).toBeVisible();
    await expect
      .poll(() => profileRows(page))
      .toEqual([
        expect.stringMatching(
          new RegExp(`^TimetableOpen now \\| 6 \\| ${cards} \\| (Today|Yesterday) \\d\\d:\\d\\d$`),
        ),
      ]);
    // The open profile, and the last one, can't be opened again or deleted.
    await expect(page.getByRole('button', { name: 'Open Timetable' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete Timetable' })).toHaveCount(0);

    // New profile: the name is checked, then an empty timetable is made.
    await page.getByRole('button', { name: 'New profile' }).click();
    let dialog = page.getByRole('dialog', { name: 'New profile' });
    await expect(dialog.getByLabel('Name')).toHaveValue('');
    await dialog.getByRole('button', { name: 'New profile' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter a profile name.');
    await dialog.getByLabel('Name').fill('timetable');
    await dialog.getByRole('button', { name: 'New profile' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      "There's already a profile called Timetable.",
    );
    await dialog.getByLabel('Name').fill('Draft term 2');
    await dialog.getByRole('button', { name: 'New profile' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('2 profiles', { exact: true })).toBeVisible();
    await expect
      .poll(async () => (await profileRows(page))[1])
      .toMatch(/^Draft term 2 \| 0 \| 0 \| (Today|Yesterday) /);

    // Duplicate copies everything under a new name.
    await page.getByRole('button', { name: 'Duplicate Timetable' }).click();
    dialog = page.getByRole('dialog', { name: 'Duplicate Timetable' });
    await expect(dialog.getByLabel('Name')).toHaveValue('Timetable copy');
    await dialog.getByRole('button', { name: 'Duplicate' }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () => (await profileRows(page))[2])
      .toMatch(new RegExp(`^Timetable copy \\| 6 \\| ${cards} \\|`));

    // Rename: names are unique, and the header follows the open profile's.
    await page.getByRole('button', { name: 'Rename Timetable copy' }).click();
    dialog = page.getByRole('dialog', { name: 'Rename Timetable copy' });
    await dialog.getByLabel('Name').fill('Draft term 2');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      "There's already a profile called Draft term 2.",
    );
    await dialog.getByLabel('Name').fill('Trial');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Rename Timetable' }).click();
    dialog = page.getByRole('dialog', { name: 'Rename Timetable' });
    await dialog.getByLabel('Name').fill('This year');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(pill(page)).toHaveText('This year');
    expect(profilesList().profiles.map((p) => p.name)).toEqual([
      'This year',
      'Draft term 2',
      'Trial',
    ]);

    // Open goes to the timetable screen on the other profile's timetable.
    await page.getByRole('button', { name: 'Open Draft term 2' }).click();
    await expect(title(page)).toHaveText('No classes yet');
    await expect(pill(page)).toHaveText('Draft term 2');
    // A new profile has no grades (DM-8): Add grades opens the Classes page's Grades, and
    // once Grade 6 is there it takes a class.
    await expect(page.getByRole('radiogroup', { name: 'Grade' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New class' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Add grades' }).click();
    await addGrade(page, '6');
    await gradesDialog(page).getByRole('button', { name: 'Close' }).click();
    await menuLink(page, 'Timetable').click();
    await page.getByRole('button', { name: 'New class' }).click();
    dialog = page.getByRole('dialog', { name: 'New class' });
    await dialog.getByLabel('Class name').fill('6A3');
    await dialog.getByRole('button', { name: 'Add class' }).click();
    await expect(title(page)).toHaveText('6A3');

    // …and the first one's grid comes back as it was, on the class last on screen in it.
    await showProfiles(page);
    await page.getByRole('button', { name: 'Open This year' }).click();
    await expect(title(page)).toHaveText('8CE1');
    await expect(placedCount(page)).toHaveText('4/50');
    await expect(pill(page)).toHaveText('This year');

    // The change made in Draft term 2 was saved before This year opened.
    await showProfiles(page);
    await expect
      .poll(async () => (await profileRows(page))[1])
      .toMatch(/^Draft term 2 \| 1 \| 0 \|/);

    // Delete asks first, saying what goes with the profile, and Keep keeps it.
    const draftId = profilesList().profiles[1]!.id;
    await page.getByRole('button', { name: 'Delete Draft term 2' }).click();
    dialog = page.getByRole('dialog', { name: 'Delete Draft term 2?' });
    await expect(dialog).toContainText("It has 1 class and 0 cards. This can't be undone.");
    await expect(dialog.getByRole('button', { name: 'Keep the profile' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Keep the profile' }).click();
    await expect(page.getByText('3 profiles', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Delete Draft term 2' }).click();
    await dialog.getByRole('button', { name: 'Delete profile' }).click();
    await expect(page.getByText('2 profiles', { exact: true })).toBeVisible();
    expect(profilesList().profiles.map((p) => p.name)).toEqual(['This year', 'Trial']);
    expect(existsSync(join(userData, 'profiles', draftId))).toBe(false);

    // The copy opens on the class it was copied with.
    await page.getByRole('button', { name: 'Open Trial' }).click();
    await expect(title(page)).toHaveText('8CE1');
    await expect(pill(page)).toHaveText('Trial');
  });

  // The app reopens the profile last open.
  await withApp(async (page) => {
    await expect(pill(page)).toHaveText('Trial');
    await expect(title(page)).toHaveText('8CE1');
  });
});

test("another profile doesn't open while the open one's changes aren't saved (PF-1)", async () => {
  seedSampleSchool();
  await withApp(async (page) => {
    await showProfiles(page);
    await page.getByRole('button', { name: 'New profile' }).click();
    const dialog = page.getByRole('dialog', { name: 'New profile' });
    await dialog.getByLabel('Name').fill('Draft');
    await dialog.getByRole('button', { name: 'New profile' }).click();
    await expect(dialog).toHaveCount(0);

    // The open profile's folder can't be written to, so the next change isn't saved.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: 'Timetable' })
      .click();
    chmodSync(profileFolder(userData), 0o555);
    await page.getByRole('button', { name: 'New class' }).click();
    const newClass = page.getByRole('dialog', { name: 'New class' });
    await newClass.getByLabel('Class name').fill('6A3');
    await newClass.getByRole('button', { name: 'Add class' }).click();
    await expect(page.getByText("Your latest changes aren't saved")).toBeVisible();

    await showProfiles(page);
    await page.getByRole('button', { name: 'Open Draft' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: "Draft can't be opened yet" }),
    ).toBeVisible();
    await expect(pill(page)).toHaveText('Timetable');

    // Once it can be saved, Open saves it and goes ahead.
    chmodSync(profileFolder(userData), 0o755);
    const timetableId = profilesList().openId;
    await page.getByRole('button', { name: 'Open Draft' }).click();
    await expect(pill(page)).toHaveText('Draft');
    const saved = JSON.parse(
      readFileSync(join(userData, 'profiles', timetableId, 'timetable.json'), 'utf8'),
    ) as TimetableFile;
    expect(saved.classes.map((c) => c.name)).toContain('6A3');
  });
});

async function newProfile(page: Page, name: string) {
  await page.getByRole('button', { name: 'New profile' }).click();
  const dialog = page.getByRole('dialog', { name: 'New profile' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'New profile' }).click();
  await expect(dialog).toHaveCount(0);
}

const menuLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name });

test("a profile that can't be read is listed, deleted as it is, or left for another (PF-1, PF-2)", async () => {
  seedSampleSchool();
  await withApp(async (page) => {
    await showProfiles(page);
    await newProfile(page, 'Broken');
    const brokenId = profilesList().profiles[1]!.id;
    writeFileSync(join(userData, 'profiles', brokenId, 'timetable.json'), '{ not json');

    // The counts are read afresh each time the screen opens.
    await menuLink(page, 'Timetable').click();
    await showProfiles(page);
    await expect
      .poll(async () => (await profileRows(page))[1])
      .toMatch(/^Broken \| – \| – \| (Today|Yesterday) /);
    await page.getByRole('button', { name: 'Delete Broken' }).click();
    const question = page.getByRole('dialog', { name: 'Delete Broken?' });
    await expect(question).toContainText(
      "Its timetable can't be read, and it's deleted as it is. This can't be undone.",
    );
    await question.getByRole('button', { name: 'Keep the profile' }).click();

    // Opening it shows the damaged-file screen, which can go back to another profile.
    await page.getByRole('button', { name: 'Open Broken' }).click();
    await expect(title(page)).toHaveText("The profile Broken couldn't be opened");
    await page.getByRole('button', { name: 'Open Timetable' }).click();
    await expect(title(page)).toHaveText('8CE1');
    await expect(pill(page)).toHaveText('Timetable');
    // The damaged file was left as it was.
    expect(readFileSync(join(userData, 'profiles', brokenId, 'timetable.json'), 'utf8')).toBe(
      '{ not json',
    );
  });
});

test('a long profile name is cut in the header without moving the menu, and keeps its chip (PF-2)', async () => {
  const long = 'Trial timetable for the second half of 2027 - 2028, draft B';
  expect(long.length).toBeLessThanOrEqual(60);
  await withApp(async (page) => {
    // The narrowest window, where the name column is too narrow for a 60-character name.
    await page.setViewportSize({ width: 1280, height: 720 });
    const before = await menuLink(page, 'Timetable').boundingBox();
    await showProfiles(page);
    await newProfile(page, long);
    await page.getByRole('button', { name: `Open ${long}` }).click();
    await expect(pill(page)).toHaveAttribute('title', long);

    const pillBox = (await pill(page).boundingBox())!;
    expect(pillBox.width).toBeLessThanOrEqual(200);
    expect(await menuLink(page, 'Timetable').boundingBox()).toEqual(before);

    // On the profile screen the long open name gives way to its "Open now" chip.
    await showProfiles(page);
    const row = page.getByRole('row').filter({ hasText: long.slice(0, 20) });
    const cell = (await row.getByRole('rowheader').boundingBox())!;
    const chip = (await row.getByText('Open now').boundingBox())!;
    expect(chip.width).toBeGreaterThan(0);
    expect(chip.x + chip.width).toBeLessThanOrEqual(cell.x + cell.width);
  });
});

async function addClass(page: Page, name: string) {
  await page.getByRole('button', { name: 'New class' }).click();
  const dialog = page.getByRole('dialog', { name: 'New class' });
  await dialog.getByLabel('Class name').fill(name);
  await dialog.getByRole('button', { name: 'Add class' }).click();
  await expect(title(page)).toHaveText(name);
}

const profileFile = (id: string, name = 'timetable.json') => join(userData, 'profiles', id, name);
const readProfile = (id: string, name?: string) =>
  JSON.parse(readFileSync(profileFile(id, name), 'utf8')) as TimetableFile;
const phucLine = (page: Page) => page.getByText(/^Tạ Văn Phúc · /);

async function showPhuc(page: Page) {
  await menuLink(page, 'Teachers').click();
  await page.getByRole('button', { name: 'Open Thầy Phúc' }).click();
}

test('each profile keeps its own timetable and backup, so a change in one never shows in another (PF-1)', async () => {
  seedSampleSchool();
  let timetableId = '';
  let copyId = '';
  await withApp(async (page) => {
    // A change in Timetable first, so it has a backup of its own.
    await addClass(page, '6A3');
    await showProfiles(page);
    await page.getByRole('button', { name: 'Duplicate Timetable' }).click();
    await page
      .getByRole('dialog', { name: 'Duplicate Timetable' })
      .getByRole('button', { name: 'Duplicate' })
      .click();
    await page.getByRole('button', { name: 'Open Timetable copy' }).click();
    await expect(pill(page)).toHaveText('Timetable copy');
    [timetableId, copyId] = profilesList().profiles.map((p) => p.id) as [string, string];

    // Two changes in the copy, saved one at a time: a class, then a phone for Thầy Phúc.
    await addClass(page, '6A4');
    await expect.poll(() => readProfile(copyId).classes.map((c) => c.name)).toContain('6A4');
    await showPhuc(page);
    await page.getByRole('button', { name: 'Edit' }).click();
    const form = page.getByRole('dialog', { name: 'Edit Thầy Phúc' });
    await form.getByLabel('Phone').fill('0911 222 333');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(phucLine(page)).toHaveText(
      'Tạ Văn Phúc · phuc.tv@example.com · 0911 222 333 · Both',
    );
    await expect
      .poll(() => readProfile(copyId).teachers.find((t) => t.id === 't-phuc')?.phone)
      .toBe('0911 222 333');

    // Neither shows in Timetable.
    await showProfiles(page);
    await page.getByRole('button', { name: 'Open Timetable' }).click();
    await expect(pill(page)).toHaveText('Timetable');
    await expect(title(page)).toHaveText('6A3');
    await expect(page.getByRole('button', { name: /^6A3,/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^6A4,/ })).toHaveCount(0);
    await showPhuc(page);
    await expect(phucLine(page)).toHaveText('Tạ Văn Phúc · phuc.tv@example.com · Both');
  });

  // Each backup is the version before its own profile's latest save.
  expect(readProfile(timetableId, 'timetable.json.bak')).toEqual(exampleSchool);
  const copyBackup = readProfile(copyId, 'timetable.json.bak');
  expect(copyBackup.classes.map((c) => c.name)).toContain('6A4');
  expect(copyBackup.teachers.find((t) => t.id === 't-phuc')?.phone).toBeUndefined();
  expect(readProfile(timetableId).classes.map((c) => c.name)).not.toContain('6A4');

  // The copy's file is damaged: its own damaged-file screen opens its own backup.
  const timetableFiles = ['timetable.json', 'timetable.json.bak'].map((name) =>
    readFileSync(profileFile(timetableId, name), 'utf8'),
  );
  writeFileSync(profileFile(copyId), '{ not json');
  await withApp(async (page) => {
    await expect(pill(page)).toHaveText('Timetable');
    await showProfiles(page);
    await page.getByRole('button', { name: 'Open Timetable copy' }).click();
    await expect(title(page)).toHaveText("The profile Timetable copy couldn't be opened");
    await page.getByRole('button', { name: 'Open the backup' }).click();
    await expect(pill(page)).toHaveText('Timetable copy');
    await expect(title(page)).toHaveText('6A4');
    await showPhuc(page);
    await expect(phucLine(page)).toHaveText('Tạ Văn Phúc · phuc.tv@example.com · Both');
  });
  expect(
    ['timetable.json', 'timetable.json.bak'].map((name) =>
      readFileSync(profileFile(timetableId, name), 'utf8'),
    ),
  ).toEqual(timetableFiles);
});

test('Open shows the first class by grade when the profile remembers none, or one that is gone (PF-2)', async () => {
  await withApp(async (page) => {
    await showProfiles(page);
    await newProfile(page, 'No class kept');
    await newProfile(page, 'Class gone');
    const [, noneId, goneId] = profilesList().profiles.map((p) => p.id) as [string, string, string];
    // Both hold the sample school, filled in by hand with its classes listed last first, so
    // the first by grade isn't the file's first: one with no settings, the other remembering
    // a class it doesn't have.
    const reversed = { ...exampleSchool, classes: [...exampleSchool.classes].reverse() };
    for (const id of [noneId, goneId]) {
      writeFileSync(profileFile(id), serializeTimetableFile(reversed));
    }
    rmSync(profileFile(noneId, 'settings.json'), { force: true });
    writeFileSync(
      profileFile(goneId, 'settings.json'),
      JSON.stringify({ selectedClassId: 'c-gone' }),
    );

    await page.getByRole('button', { name: 'Open No class kept' }).click();
    await expect(pill(page)).toHaveText('No class kept');
    await expect(title(page)).toHaveText('6A1');
    await showProfiles(page);
    await page.getByRole('button', { name: 'Open Class gone' }).click();
    await expect(pill(page)).toHaveText('Class gone');
    await expect(title(page)).toHaveText('6A1');
  });
});

test('a second copy on the same data folder quits and leaves the open window (R4-8 review)', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.topbar')).toBeVisible();

    // Started again as a user would, on the same data folder.
    const second = spawn(join('node_modules', '.bin', 'electron'), ['.'], {
      env: { ...process.env, TTM_USER_DATA: userData },
      stdio: 'ignore',
    });
    const code = await new Promise<number | null>((done) => second.on('exit', done));
    expect(code).toBe(0);
    expect(app.windows()).toHaveLength(1);
    await expect(page.locator('.topbar')).toBeVisible();
  } finally {
    await app.close();
  }
});
