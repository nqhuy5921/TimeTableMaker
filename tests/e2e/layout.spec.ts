import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptySchool } from '../../fixtures/emptySchool';
import type { Card, TimetableFile } from '../../src/domain/model';
import { serializeTimetableFile } from '../../src/shared/fileFormat';

// The timetable screen keeps its layout still (asked 2026-10-20): the class bar keeps its
// height on a grade with no classes, the grid keeps its row height whether or not the
// class has cards on it, and the panel cards keep their width when the panel scrolls.
// The page itself never scrolls, so a scrollbar can't push a screen left (asked
// 2026-10-21): the Cards table scrolls in its panel under a pinned header. The header
// menu's links keep their place when the active screen changes (asked 2026-10-21). Made-up
// names only.

let userData: string;

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(school));
});

test.afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

const subjects = Array.from({ length: 14 }, (_, i) => ({
  id: `s${i}`,
  name: `Môn ${i + 1}`,
  colorKey: 'math' as const,
}));

function card(id: string, subjectId: string, roomId: string | null = null): Card {
  return { id, subjectId, teacherId: null, roomId };
}

/** A pool of 15 cards, enough to scroll the panel. 6A1 has one card on its grid, 6A2 has
    none, and 6A3 has another. Grade 7 has no classes. */
const school: TimetableFile = {
  ...emptySchool(),
  classes: [
    { id: 'c1', name: '6A1', grade: 6, track: 'A', section: 1 },
    { id: 'c2', name: '6A2', grade: 6, track: 'A', section: 2 },
    { id: 'c3', name: '6A3', grade: 6, track: 'A', section: 3 },
  ],
  subjects,
  rooms: [{ id: 'r1', name: 'P101' }],
  cards: [...subjects.map((s) => card(`k-${s.id}`, s.id)), card('k-only', 's0', 'r1')],
  placements: [
    { id: 'p1', cardId: 'k-s0', classId: 'c1', day: 0, block: 0, part: 'full' },
    { id: 'p2', cardId: 'k-only', classId: 'c3', day: 1, block: 0, part: 'full' },
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

/** The sizes that mustn't move, rounded to whole pixels. */
async function sizes(page: Page) {
  const height = async (selector: string) =>
    Math.round((await page.locator(selector).first().boundingBox())?.height ?? 0);
  return {
    classBar: await height('.class-bar'),
    grid: await height('.tt-frame'),
    slot: await height('.tt-slot'),
    summary: await height('.period-summary'),
  };
}

const cardWidth = async (page: Page) =>
  Math.round((await page.locator('.subject-card').first().boundingBox())?.width ?? 0);

for (const [viewWidth, viewHeight] of [
  [1440, 900],
  [1280, 720],
] as const) {
  test(`the layout stays still at ${viewWidth} × ${viewHeight}`, async () => {
    await withApp(async (page) => {
      await page.setViewportSize({ width: viewWidth, height: viewHeight });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A1');
      const panelBody = page.locator('.side-panel-content:not([hidden]) .side-panel-body');
      const scrolls = () => panelBody.evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(await scrolls()).toBe(true);
      const start = await sizes(page);
      const width = await cardWidth(page);

      // A class with nothing placed: the summary shows its empty line instead of tags.
      await page.getByRole('button', { name: /^6A2,/ }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A2');
      expect(await sizes(page)).toEqual(start);

      // Another class, then a search down to one card: the panel stops scrolling, and the
      // card keeps its width.
      await page.getByRole('button', { name: /^6A3,/ }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A3');
      expect(await sizes(page)).toEqual(start);
      await page.getByRole('searchbox').fill('môn 14');
      await expect(page.locator('.subject-card')).toHaveCount(1);
      expect(await scrolls()).toBe(false);
      expect(await sizes(page)).toEqual(start);
      expect(await cardWidth(page)).toBe(width);

      // A grade with no classes has only the New class tile.
      await page.getByRole('radio', { name: 'Grade 7' }).click();
      await expect(page.getByRole('group', { name: 'Grade 7 classes' })).toBeVisible();
      expect(await sizes(page)).toEqual(start);

      // The page doesn't scroll on either screen, and both screens keep the same edges.
      const main = page.locator('.shell-main');
      const pageScrolls = () => main.evaluate((el) => el.scrollHeight > el.clientHeight);
      const edges = async (selector: string) => {
        const box = await page.locator(selector).boundingBox();
        return box && [Math.round(box.x), Math.round(box.x + box.width)];
      };
      expect(await pageScrolls()).toBe(false);
      const timetableEdges = await edges('.class-bar');

      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('button', { name: 'Cards' })
        .click();
      await expect(page.getByText('15 cards')).toBeVisible();
      expect(await pageScrolls()).toBe(false);
      expect(await edges('.list-table-panel')).toEqual(timetableEdges);

      // 15 rows scroll inside the panel, and the header row stays at its top.
      const tablePanel = page.locator('.list-table-panel');
      expect(await tablePanel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      const header = page.getByRole('columnheader', { name: 'Subject' });
      const headerTop = (await header.boundingBox())?.y;
      await tablePanel.evaluate((el) => el.scrollBy(0, 400));
      expect((await header.boundingBox())?.y).toBe(headerTop);
      await expect(header).toBeInViewport();

      // Searching down to one row doesn't move the columns.
      const columnWidths = () =>
        page.getByRole('columnheader').evaluateAll((cells) => cells.map((c) => c.clientWidth));
      const widths = await columnWidths();
      await page.getByRole('searchbox').fill('6a3');
      await expect(page.getByRole('row')).toHaveCount(2);
      expect(await tablePanel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(false);
      expect(await columnWidths()).toEqual(widths);
    });
  });
}

test('the header menu links keep their place and size whichever screen is open', async () => {
  await withApp(async (page) => {
    const links = page.getByRole('navigation', { name: 'Main' }).getByRole('button');
    const boxes = () =>
      links.evaluateAll((buttons) =>
        buttons.map((b) => {
          const r = (
            b as unknown as { getBoundingClientRect(): DOMRectLike }
          ).getBoundingClientRect();
          return [Math.round(r.x), Math.round(r.width)];
        }),
      );
    await expect(links).toHaveCount(6);
    const first = await boxes();
    for (const name of ['Cards', 'Teachers', 'Subjects', 'Timetable']) {
      // By name, so a doubled name from the hidden width copy would fail here too.
      const link = page.getByRole('navigation', { name: 'Main' }).getByRole('button', {
        name,
        exact: true,
      });
      await link.click();
      await expect(link).toHaveAttribute('aria-current', 'page');
      expect(await boxes()).toEqual(first);
    }
  });
});

test('the grade options and the class tiles keep their place whichever grade is chosen (2026-11-02)', async () => {
  await withApp(async (page) => {
    const grades = page.getByRole('radiogroup', { name: 'Grade' }).getByRole('radio');
    // Each grade option's place and width, then where the tiles start (their width follows
    // how many classes the grade has).
    const boxes = () =>
      page.locator('.class-picker .segmented-option, .class-tiles').evaluateAll((elements) =>
        elements.map((el) => {
          const r = (
            el as unknown as { getBoundingClientRect(): DOMRectLike }
          ).getBoundingClientRect();
          return el === elements.at(-1)
            ? [Math.round(r.x)]
            : [Math.round(r.x), Math.round(r.width)];
        }),
      );
    await expect(grades).toHaveCount(4);
    const first = await boxes();
    for (const name of ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 6']) {
      // By name, so a doubled name from the hidden width copy would fail here too.
      const grade = page.getByRole('radio', { name, exact: true });
      await grade.click();
      await expect(grade).toHaveAttribute('aria-checked', 'true');
      expect(await boxes()).toEqual(first);
    }
  });
});

test('twelve grades keep the class bar still: the tabs never shrink, and the tiles scroll (DM-8)', async () => {
  let height = 0;
  await withApp(async (page) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByRole('radiogroup', { name: 'Grade' }).getByRole('radio')).toHaveCount(4);
    height = Math.round((await page.locator('.class-bar').boundingBox())?.height ?? 0);
  });
  const twelve = { ...school, grades: Array.from({ length: 12 }, (_, i) => i + 1) };
  writeFileSync(join(userData, 'timetable.json'), serializeTimetableFile(twelve));

  await withApp(async (page) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const grades = page.getByRole('radiogroup', { name: 'Grade' }).getByRole('radio');
    await expect(grades).toHaveCount(12);
    await expect(grades.last()).toHaveText('Grade 12');
    expect(Math.round((await page.locator('.class-bar').boundingBox())?.height ?? 0)).toBe(height);

    // No grade option is squeezed narrower than its label.
    const clipped = await page
      .locator('.class-picker .segmented-option')
      .evaluateAll(
        (options) =>
          options.filter(
            (o) =>
              (o as unknown as Scrollable).scrollWidth > (o as unknown as Scrollable).clientWidth,
          ).length,
      );
    expect(clipped).toBe(0);

    // The tiles keep a row of their own beside the tabs, scrolling sideways to New class,
    // and the page doesn't scroll sideways.
    const tiles = page.locator('.class-tiles');
    expect((await tiles.boundingBox())?.width ?? 0).toBeGreaterThan(0);
    expect(
      await tiles.evaluate(
        (el) =>
          (el as unknown as Scrollable).scrollWidth > (el as unknown as Scrollable).clientWidth,
      ),
    ).toBe(true);
    const newClass = page.getByRole('button', { name: 'New class' });
    await newClass.scrollIntoViewIfNeeded();
    await expect(newClass).toBeInViewport();
    const main = page.locator('.shell-main');
    expect(
      await main.evaluate(
        (el) =>
          (el as unknown as Scrollable).scrollWidth > (el as unknown as Scrollable).clientWidth,
      ),
    ).toBe(false);

    // A grade with no classes, at the far end, keeps the bar's height.
    await page.getByRole('radio', { name: 'Grade 12' }).click();
    await expect(page.getByRole('group', { name: 'Grade 12 classes' })).toBeVisible();
    expect(Math.round((await page.locator('.class-bar').boundingBox())?.height ?? 0)).toBe(height);
  });
});

test("a dropdown's chevron sits 12px in from its right edge, with no system arrow (2026-10-26)", async () => {
  await withApp(async (page) => {
    /** For each dropdown: its CSS appearance, and how far the chevron's right side is from
        the select's right edge. */
    const placement = (select: ReturnType<Page['getByRole']>) =>
      select.evaluate((el) => {
        const box = el as unknown as {
          getBoundingClientRect(): DOMRectLike;
          parentElement: { querySelector(s: string): typeof box | null };
        };
        const css = (globalThis as unknown as { getComputedStyle: ComputedStyle }).getComputedStyle;
        const chevron = box.parentElement.querySelector('svg');
        const s = box.getBoundingClientRect();
        const c = chevron?.getBoundingClientRect();
        return [css(el).appearance, c ? Math.round(s.x + s.width - (c.x + c.width)) : null];
      });

    // A form dropdown: the card form's Subject.
    await page.getByRole('button', { name: 'Add subject' }).last().click();
    const subject = page.getByRole('dialog').getByLabel('Subject');
    expect(await placement(subject)).toEqual(['none', 12]);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    // A filter pill: the Issues tab's Teacher.
    await page.getByRole('tab', { name: /^Issues/ }).click();
    const teacher = page.getByRole('combobox', { name: 'Teacher' });
    expect(await placement(teacher)).toEqual(['none', 12]);
  });
});

/** `getComputedStyle` in the page. The e2e tests are typed without the DOM library. */
type ComputedStyle = (el: unknown) => Record<string, string>;

/** An element's scroll sizes, typed without the DOM library. */
interface Scrollable {
  scrollWidth: number;
  clientWidth: number;
}

interface DOMRectLike {
  x: number;
  width: number;
}
