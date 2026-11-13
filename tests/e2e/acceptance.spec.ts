import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SAMPLE_CLASSES,
  SAMPLE_ISSUE_COUNTS,
  SAMPLE_ISSUES,
  SAMPLE_PLACED,
} from '../../fixtures/sampleExpectations';
import { exampleSchool } from '../../src/domain/exampleSchool';
import { savedPath } from './dataFolder';
import { issueCountsText } from '../../src/domain/issues';
import { serializeTimetableFile } from '../../src/shared/fileFormat';
import { listRowTexts } from './listPage';

// The acceptance pass on the made-up sample school: release 1's (R1-8),
// release 2's (R2-6), and release 3's (R3-4). The other specs each cover one step with a small school; this one
// checks the criteria they leave out, on a school with several classes, tracks, and
// teachers.

let userData: string;

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(exampleSchool));
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

const title = (page: Page) => page.getByRole('heading', { level: 1 });
const grade = (page: Page, n: number) => page.getByRole('radio', { name: `Grade ${n}` });
const tile = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name},`) });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Subjects and issues' });
const panelCards = (page: Page) => panel(page).getByRole('listitem').getByRole('button');
/** A pool card by its subject and its "teacher · room" line. */
const panelCard = (page: Page, subject: string, details: string) =>
  panelCards(page)
    .filter({ has: page.getByText(subject, { exact: true }) })
    .filter({ has: page.getByText(details, { exact: true }) });
const slot = (page: Page, name: string) =>
  page.getByRole('cell', { name: new RegExp(`^${name}[,:]`) });
const placedCount = (page: Page) => page.getByTestId('placed-count');
const summary = (page: Page) => page.getByRole('region', { name: 'Periods per subject' });
const menu = (page: Page) => page.getByRole('navigation', { name: 'Main' });
/** The Classes cell of a card's row on the Cards page. */
const classesCell = (page: Page, card: string) =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Edit ${card}`, exact: true }) })
    .getByRole('cell')
    .nth(2);

async function pickClass(page: Page, name: string) {
  await grade(page, Number(name[0])).click();
  await tile(page, name).click();
  await expect(title(page)).toHaveText(name);
}

/** `getComputedStyle` in the page. The e2e tests are typed without the DOM library. */
type ComputedStyle = (el: unknown, pseudo?: string) => Record<string, string>;

/** Every slot's accessible name, in grid order. */
const slotNames = (page: Page) =>
  page.getByTestId('slot').evaluateAll((slots) => slots.map((s) => s.getAttribute('aria-label')));

/** Drags a card over a target and lets go there. */
async function dragTo(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport();
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

test('each class shows its own grid and the whole pool, and switching loses nothing (TB-1)', async () => {
  await withApp(async (page) => {
    // Opens on the first class by grade, with each class's placed count in its tile, and
    // since release 2 its errors and warnings (TB-1, TC-3).
    await expect(title(page)).toHaveText('6A1');
    for (const name of SAMPLE_CLASSES) {
      await grade(page, Number(name[0])).click();
      const issues = issueCountsText(SAMPLE_ISSUE_COUNTS[name]);
      await expect(tile(page, name)).toHaveAccessibleName(
        [name, `${SAMPLE_PLACED[name]} of 50 periods placed`, issues].filter(Boolean).join(', '),
      );
    }
    await grade(page, 6).click();
    await expect(
      page.getByRole('group', { name: 'Grade 6 classes' }).getByRole('button'),
    ).toHaveText([/6A1$/, /6A2$/, 'New class']); // after any issue badges

    // 6A1's grid: full blocks, two halves sharing a block, and a half alone.
    await pickClass(page, '6A1');
    await expect(placedCount(page)).toHaveText('18/50');
    await expect(slot(page, 'Monday periods 1–2')).toHaveAccessibleName(
      'Monday periods 1–2, Toán, Thầy Phúc · P101',
    );
    await expect(slot(page, 'Friday periods 9–10')).toHaveAccessibleName(
      'Friday periods 9–10: period 9 SH lớp, Cô Ngân; period 10 GDPC, Cô Ngân',
    );
    await expect(slot(page, 'Wednesday periods 1–2')).toHaveAccessibleName(
      'Wednesday periods 1–2: period 1 Tin học, Thầy Hiếu · Phòng Tin 1; period 2 empty',
    );
    const sixA1 = await slotNames(page);
    // The panel lists the whole pool, whichever class is on screen.
    const poolSize = exampleSchool.cards.length;
    await expect(panelCards(page)).toHaveCount(poolSize);

    // 8CE1 shows only its own placements.
    await pickClass(page, '8CE1');
    await expect(placedCount(page)).toHaveText('4/50');
    await expect(slot(page, 'Monday periods 1–2')).toHaveAccessibleName(
      'Monday periods 1–2, empty',
    );
    await expect(slot(page, 'Tuesday periods 1–2')).toHaveAccessibleName(
      'Tuesday periods 1–2: period 1 Tiếng Anh, Cô Trâm · P202; period 2 Lịch sử, Cô Trâm · P202',
    );
    await expect(panelCards(page)).toHaveCount(poolSize);

    // 9B1 has nothing placed: a blank grid (TB-2), with the pool beside it.
    await pickClass(page, '9B1');
    await expect(placedCount(page)).toHaveText('0/50');
    expect((await slotNames(page)).every((name) => name?.endsWith(', empty'))).toBe(true);
    await expect(panelCards(page)).toHaveCount(poolSize);
    // Empty slots are white with a faint dashed midline (layout spec, in place of TB-2's
    // dashed placeholders).
    await page.mouse.move(0, 0);
    const look = await slot(page, 'Monday periods 1–2').evaluate((el) => {
      const css = (globalThis as unknown as { getComputedStyle: ComputedStyle }).getComputedStyle;
      const midline = css(el, '::before');
      return [css(el).backgroundColor, midline.borderTopStyle, midline.top];
    });
    expect(look[0]).toBe('rgb(255, 255, 255)');
    expect(look[1]).toBe('dashed');
    expect(look[2]).not.toBe('auto');

    await pickClass(page, '9BA1');
    await expect(placedCount(page)).toHaveText('0/50');
    await expect(panelCards(page)).toHaveCount(poolSize);

    // Back on 6A1, nothing was lost.
    await pickClass(page, '6A1');
    await expect(placedCount(page)).toHaveText('18/50');
    expect(await slotNames(page)).toEqual(sixA1);
  });
});

test('breaks and lunch are shown but take no cards (TB-2)', async () => {
  await withApp(async (page) => {
    await pickClass(page, '9B1');
    const before = await slotNames(page);
    const toan = panelCard(page, 'Toán', 'Thầy Phúc');
    await dragTo(page, toan, page.getByRole('cell', { name: /^Lunch break/ }));
    await dragTo(page, toan, page.getByRole('cell', { name: /^Break/ }).first());
    await dragTo(page, toan, page.getByRole('cell', { name: /^Snack break/ }));
    await expect(placedCount(page)).toHaveText('0/50');
    expect(await slotNames(page)).toEqual(before);

    // A slot does take it.
    await dragTo(page, toan, slot(page, 'Monday periods 1–2'));
    await expect(placedCount(page)).toHaveText('2/50');
  });
});

test('a card looks the same in the panel and on the grid (DM-5)', async () => {
  await withApp(async (page) => {
    await pickClass(page, '6A1');
    await page.mouse.move(0, 0);
    const colors = (locator: Locator) =>
      locator.evaluate((el) => {
        const css = (globalThis as unknown as { getComputedStyle: ComputedStyle }).getComputedStyle;
        const style = css(el);
        return [style.backgroundColor, style.color];
      });
    const onGrid = (slotName: string) => slot(page, slotName).getByTestId('placed-card');

    for (const [subject, slotName, details] of [
      ['Toán', 'Monday periods 1–2', 'Thầy Phúc · P101'],
      ['Ngữ văn', 'Monday periods 3–4', 'Cô Ngân · P101'],
      ['Thể dục', 'Tuesday periods 7–8', 'Thầy Tùng · Sân thể chất'],
      ['Toán phân hoá/ Ngoại ngữ 2', 'Thursday periods 7–8', 'Thầy Phúc · P102'],
    ] as const) {
      await expect(panelCard(page, subject, details)).toHaveText(`${subject}${details}`);
      await expect(onGrid(slotName)).toHaveText(`${subject}${details}`);
      expect(await colors(onGrid(slotName))).toEqual(
        await colors(panelCard(page, subject, details)),
      );
    }
    // Different subjects get different colors.
    expect(await colors(panelCard(page, 'Toán', 'Thầy Phúc · P101'))).not.toEqual(
      await colors(panelCard(page, 'Ngữ văn', 'Cô Ngân · P101')),
    );
  });
});

test('editing a card updates every placement of it, in every class (DM-5)', async () => {
  await withApp(async (page) => {
    // 6A2 has Ngữ văn with Cô Ngân in the same block as 6A1's. Nothing stops it (TB-4,
    // TC-4); since release 2 it's marked as an error (TC-3).
    await pickClass(page, '6A2');
    await expect(slot(page, 'Monday periods 3–4')).toHaveAccessibleName(
      'Monday periods 3–4, Ngữ văn, Cô Ngân · P102, 1 error',
    );

    // Cô Vy's Tiếng Anh card is on 6A1's grid (Tuesday 1–2) and 6A2's (Wednesday 5–6).
    // Give it Thầy Quân and no room.
    await pickClass(page, '6A1');
    await panelCard(page, 'Tiếng Anh', 'Cô Vy · P101').click();
    const form = page.getByRole('dialog', { name: 'Edit Tiếng Anh · Cô Vy · P101' });
    await form.getByLabel('Teacher').selectOption({ label: 'Thầy Quân' });
    await form.getByLabel('Room', { exact: true }).selectOption({ label: 'No room' });
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form).toHaveCount(0);
    // Thầy Quân teaches 6A2's Toán then too, so the edit puts him in two places (TC-2).
    await expect(slot(page, 'Tuesday periods 1–2')).toHaveAccessibleName(
      'Tuesday periods 1–2, Tiếng Anh, Thầy Quân, 1 error',
    );
    await expect(placedCount(page)).toHaveText('18/50');
    await pickClass(page, '6A2');
    await expect(slot(page, 'Wednesday periods 5–6')).toHaveAccessibleName(
      'Wednesday periods 5–6, Tiếng Anh, Thầy Quân',
    );

    // 8CE1's Tiếng Anh is another card, and keeps Cô Trâm.
    await pickClass(page, '8CE1');
    await expect(slot(page, 'Tuesday periods 1–2')).toHaveAccessibleName(
      'Tuesday periods 1–2: period 1 Tiếng Anh, Cô Trâm · P202; period 2 Lịch sử, Cô Trâm · P202',
    );
  });

  // After a restart (TB-7), the edit is there and every placement is where it was.
  await withApp(async (page) => {
    await expect(title(page)).toHaveText('8CE1');
    await pickClass(page, '6A2');
    await expect(slot(page, 'Wednesday periods 5–6')).toHaveAccessibleName(
      'Wednesday periods 5–6, Tiếng Anh, Thầy Quân',
    );
  });
  const saved = JSON.parse(readFileSync(savedPath(userData), 'utf8'));
  expect(saved.placements).toEqual(exampleSchool.placements);
  expect(saved.cards.find((c: { id: string }) => c.id === 'k-anh-vy')).toEqual({
    id: 'k-anh-vy',
    subjectId: 's-anh',
    teacherId: 't-quan',
    roomId: null,
  });
});

test("dropping a card on another class's grid adds that class to it, and removing it takes it off (TB-4, TB-5)", async () => {
  await withApp(async (page) => {
    // 6A1's Toán card, dropped on 8CE1's empty Monday 1–2. It's on 6A1's Monday 1–2 too,
    // so Thầy Phúc and P101 are each in two places at once: 2 errors (TC-3).
    await pickClass(page, '8CE1');
    await dragTo(
      page,
      panelCard(page, 'Toán', 'Thầy Phúc · P101'),
      slot(page, 'Monday periods 1–2'),
    );
    await expect(slot(page, 'Monday periods 1–2')).toHaveAccessibleName(
      'Monday periods 1–2, Toán, Thầy Phúc · P101, 2 errors',
    );
    await expect(placedCount(page)).toHaveText('6/50');

    await menu(page).getByRole('button', { name: 'Cards' }).click();
    await expect(classesCell(page, 'Toán · Thầy Phúc · P101')).toHaveText('6A1, 8CE1');

    // A right-click takes it off 8CE1's grid, and 8CE1 off the card.
    await menu(page).getByRole('button', { name: 'Timetable' }).click();
    await expect(title(page)).toHaveText('8CE1');
    await slot(page, 'Monday periods 1–2')
      .getByTestId('placed-card')
      .getByRole('button')
      .click({ button: 'right' });
    await expect(slot(page, 'Monday periods 1–2')).toHaveAccessibleName(
      'Monday periods 1–2, empty',
    );
    await expect(placedCount(page)).toHaveText('4/50');
    await menu(page).getByRole('button', { name: 'Cards' }).click();
    await expect(classesCell(page, 'Toán · Thầy Phúc · P101')).toHaveText('6A1');

    // 6A1's grid kept its own Toán placements throughout.
    await menu(page).getByRole('button', { name: 'Timetable' }).click();
    await pickClass(page, '6A1');
    await expect(placedCount(page)).toHaveText('18/50');
  });
});

test('two cards of one subject on a grid add up to one tag (TB-4)', async () => {
  await withApp(async (page) => {
    await pickClass(page, '9B1');
    await dragTo(page, panelCard(page, 'Toán', 'Thầy Phúc'), slot(page, 'Monday periods 1–2'));
    await dragTo(
      page,
      panelCard(page, 'Toán', 'Thầy Quân · P102'),
      slot(page, 'Tuesday periods 1–2'),
    );
    // That card is on 6A2's Tuesday 1–2 too: Thầy Quân and P102 are in two places (TC-3).
    await expect(slot(page, 'Tuesday periods 1–2')).toHaveAccessibleName(
      'Tuesday periods 1–2, Toán, Thầy Quân · P102, 2 errors',
    );
    await expect(placedCount(page)).toHaveText('4/50');
    await expect(summary(page).getByRole('listitem')).toHaveText(['Toán4']);
    await expect(summary(page).getByLabel('Toán: 4 periods')).toBeVisible();
  });
});

test("the Issues tab lists the school's issues, and follows an edit to a card (TC-3, TB-1, DM-5)", async () => {
  await withApp(async (page) => {
    // 7AA1's tile, pill, and tab: 7 errors and a warning.
    await pickClass(page, '7AA1');
    await expect(tile(page, '7AA1')).toHaveAccessibleName(
      '7AA1, 11 of 50 periods placed, 7 errors, 1 warning',
    );
    await expect(page.getByRole('button', { name: /^Issues/ })).toHaveText('Issues 8');
    await page.getByRole('button', { name: /^Issues/ }).click();
    const issues = page.getByRole('tabpanel', { name: /^Issues/ });
    await expect(issues.getByRole('heading')).toHaveText(['Errors · 7', 'Warnings · 1']);

    // All classes: every issue in the school, errors first, each saying what and where.
    await issues.getByRole('radio', { name: 'All classes' }).click();
    const rows = issues.getByRole('button');
    const named = ([severity, message, where]: readonly [string, string, string]) =>
      `${severity === 'error' ? 'Error' : 'Warning'}: ${message}. ${where}`;
    await expect(rows).toHaveCount(SAMPLE_ISSUES.length);
    for (const [i, issue] of SAMPLE_ISSUES.entries()) {
      await expect(rows.nth(i)).toHaveAccessibleName(named(issue));
    }

    // Thầy Đạt's three, with the Teacher filter.
    await issues.getByRole('combobox', { name: 'Teacher' }).selectOption('Thầy Đạt');
    await expect(issues.getByRole('heading')).toHaveText(['Errors · 3']);
    await issues.getByRole('combobox', { name: 'Teacher' }).selectOption('All teachers');

    // Cô Vy's Tiếng Anh card given to Thầy Quân: her issue goes, and his clash on
    // Tuesday 1–2 comes, straight away (DM-5, TC-2).
    await page.getByRole('tab', { name: 'Subjects' }).click();
    await panelCard(page, 'Tiếng Anh', 'Cô Vy · P101').click();
    const form = page.getByRole('dialog', { name: 'Edit Tiếng Anh · Cô Vy · P101' });
    await form.getByLabel('Teacher').selectOption({ label: 'Thầy Quân' });
    await form.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('tab', { name: /^Issues/ }).click();
    const quan = [
      'error',
      'Thầy Quân is in 6A1 and 6A2 at the same time',
      '6A1, 6A2 · Tuesday · Periods 1–2',
    ] as const;
    const [first, ...rest] = SAMPLE_ISSUES;
    const after = [first, quan, ...rest.filter(([, message]) => !message.startsWith('Cô Vy'))];
    await expect(rows).toHaveCount(after.length);
    for (const [i, issue] of after.entries()) {
      await expect(rows.nth(i)).toHaveAccessibleName(named(issue));
    }
  });
});

test('deleting a homeroom teacher says so, and Enter in the question keeps them (DM-1)', async () => {
  await withApp(async (page) => {
    await menu(page).getByRole('button', { name: 'Teachers' }).click();
    await page.getByRole('button', { name: 'Open Cô Ngân' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const question = page.getByRole('dialog');
    await expect(question.getByText('Cô Ngân stops being homeroom teacher of 6A1.')).toBeVisible();
    // Focus starts on the button that keeps her, so Enter out of habit deletes nothing.
    await expect(question.getByRole('button', { name: 'Keep the teacher' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(question).toBeHidden();
    await expect(title(page)).toHaveText('Cô Ngân');
  });
});

/** The class line under the class bar: grade, track, and homeroom teacher. */
const classLine = (page: Page) => page.getByTestId('class-line');
test('the class line and the Classes page name the homeroom teachers, and deleting the class on screen shows the first (DM-2)', async () => {
  await withApp(async (page) => {
    await expect(title(page)).toHaveText('6A1');
    await expect(classLine(page)).toHaveText('Grade 6 · Track A · Homeroom teacher Cô Ngân');
    // 9BA1 has no homeroom teacher, as a class added from the class bar.
    await pickClass(page, '9BA1');
    await expect(classLine(page)).toHaveText('Grade 9 · Track BA');

    await menu(page).getByRole('button', { name: 'Classes' }).click();
    await expect
      .poll(() => listRowTexts(page, 'Classes'))
      .toEqual([
        '6A1 | 6 | Cô Ngân | Thầy Quân | 18/50 | 5',
        '6A2 | 6 | Thầy Phúc | — | 8/50 | 3',
        '7AA1 | 7 | Thầy Đạt | Cô Trâm | 11/50 | 7',
        '8CE1 | 8 | Cô Trâm | Cô Vy | 4/50 | 1',
        '9B1 | 9 | Thầy Hiếu | — | 0/50 | ',
        '9BA1 | 9 | — | — | 0/50 | ',
      ]);

    // Deleting 9BA1, the class on screen, puts 6A1 back, the first by grade.
    await page.getByRole('button', { name: 'Delete 9BA1' }).click();
    const plain = page.getByRole('dialog', { name: 'Delete 9BA1?' });
    await expect(plain).toContainText('Nothing is placed in 9BA1.');
    await plain.getByRole('button', { name: 'Delete class' }).click();
    // Deleting 6A1 too takes its errors with it: 6A2 loses Cô Ngân's clash and Cô Vy's days.
    await page.getByRole('button', { name: 'Delete 6A1' }).click();
    await page
      .getByRole('dialog', { name: 'Delete 6A1?' })
      .getByRole('button', { name: 'Delete class' })
      .click();
    await expect
      .poll(() => listRowTexts(page, 'Classes'))
      .toContain('6A2 | 6 | Thầy Phúc | — | 8/50 | 1');

    await menu(page).getByRole('button', { name: 'Timetable' }).click();
    await expect(title(page)).toHaveText('6A2');
    await expect(classLine(page)).toHaveText('Grade 6 · Track A · Homeroom teacher Thầy Phúc');
  });
});

test('renaming a subject shows on the panel, the grid, its tag, and its issue, and its limit (DM-4)', async () => {
  await withApp(async (page) => {
    await menu(page).getByRole('button', { name: 'Subjects' }).click();
    await page.getByRole('button', { name: 'Edit Tin học' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Tin học' });
    await edit.getByLabel('Name', { exact: true }).fill('Công nghệ');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toHaveCount(0);

    // Thầy Hiếu's subject limit names it under its new name, in the delete question too.
    await page.getByRole('button', { name: 'Delete Công nghệ' }).click();
    const question = page.getByRole('dialog', { name: 'Delete Công nghệ?' });
    await expect(question).toContainText("Thầy Hiếu's subject limit on Công nghệ goes too.");
    await question.getByRole('button', { name: 'Keep the subject' }).click();

    await menu(page).getByRole('button', { name: 'Timetable' }).click();
    await expect(title(page)).toHaveText('6A1');
    await expect(panelCard(page, 'Công nghệ', 'Thầy Hiếu · Phòng Tin 1')).toHaveCount(1);
    await expect(page.getByTestId('placed-card').filter({ hasText: 'Công nghệ' })).toHaveCount(2);
    await expect(page.getByTestId('placed-card').filter({ hasText: 'Tin học' })).toHaveCount(0);
    await expect(summary(page).getByText('Công nghệ')).toBeVisible();
    await page.getByRole('button', { name: /^Issues/ }).click();
    await expect(
      page
        .getByRole('tabpanel', { name: /^Issues/ })
        .getByText('Thầy Hiếu: 2 periods of Công nghệ on Friday, limit is 1'),
    ).toBeVisible();
  });
});

test("deleting Tin học says Thầy Hiếu's subject limit goes, and takes it and its issue (DM-4, R3-5b)", async () => {
  await withApp(async (page) => {
    await menu(page).getByRole('button', { name: 'Subjects' }).click();
    await page.getByRole('button', { name: 'Delete Tin học' }).click();
    const question = page.getByRole('dialog', { name: 'Delete Tin học?' });
    await expect(question).toContainText(
      '1 card of Tin học is on the grid 3 times, in 6A1 and 7AA1. The card and its places on the grid are deleted.',
    );
    await expect(question).toContainText("Thầy Hiếu's subject limit on Tin học goes too.");
    await question.getByRole('button', { name: 'Delete subject' }).click();
    await expect(question).toHaveCount(0);

    await menu(page).getByRole('button', { name: 'Teachers' }).click();
    await page.getByRole('button', { name: 'Open Thầy Hiếu' }).click();
    await expect(page.getByText(/periods of Tin học/)).toHaveCount(0);

    await menu(page).getByRole('button', { name: 'Timetable' }).click();
    await expect(page.getByTestId('placed-card').filter({ hasText: 'Tin học' })).toHaveCount(0);
    await page.getByRole('button', { name: /^Issues/ }).click();
    const issues = page.getByRole('tabpanel', { name: /^Issues/ });
    await issues.getByRole('radio', { name: 'All classes' }).check();
    await expect(
      issues.getByText('Thầy Hiếu: 2 periods of Tin học on Friday, limit is 1'),
    ).toHaveCount(0);
  });
});
