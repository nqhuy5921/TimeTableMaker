import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('opens the timetable screen with a blank grid (TB-2)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'ttm-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TTM_USER_DATA: userData },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'No classes yet' })).toBeVisible();
    await expect(page.getByTestId('slot')).toHaveCount(25);
    // No class on screen yet, so there's no placed count (TB-1).
    await expect(page.getByTestId('placed-count')).toHaveCount(0);
    await expect(page.getByText(/^Version \d+\.\d+\.\d+$/)).toBeVisible();

    // Layout from docs/design/TIMETABLE_SCREEN_LAYOUT.md: periods as rows, the Monday
    // flag salute, and the lunch band.
    await expect(page.getByRole('rowheader', { name: /Period 10/ })).toBeVisible();
    await expect(page.getByText('Flag salute')).toBeVisible();
    await expect(page.getByText('Lunch break')).toBeVisible();

    // The issues pill opens the Issues tab.
    await expect(page.getByRole('tab', { name: /Subjects/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('button', { name: /^Issues/ }).click();
    await expect(page.getByRole('tab', { name: /Issues/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('No issues')).toBeVisible();

    // Switching tabs keeps what was typed in the search box, and the arrow keys move
    // between tabs.
    await page.getByRole('tab', { name: /Subjects/ }).click();
    await page.getByRole('searchbox').fill('toan');
    await page.getByRole('tab', { name: /Subjects/ }).press('ArrowRight');
    await expect(page.getByRole('tab', { name: /Issues/ })).toBeFocused();
    await page.getByRole('tab', { name: /Issues/ }).press('ArrowLeft');
    await expect(page.getByRole('searchbox')).toHaveValue('toan');

    // The header menu has one link per screen, and Timetable brings the grid back.
    const menu = page.getByRole('navigation', { name: 'Main' });
    await expect(menu.getByRole('button')).toHaveText([
      'Timetable',
      'Cards',
      'Teachers',
      'Classes',
      'Rooms',
      'Subjects',
    ]);
    await expect(menu.getByRole('button', { name: 'Timetable' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await menu.getByRole('button', { name: 'Subjects' }).click();
    await expect(page.getByRole('heading', { name: 'Subjects' })).toBeVisible();
    await expect(page.getByText('No subjects yet')).toBeVisible();
    await expect(page.getByTestId('slot')).toHaveCount(0);
    await menu.getByRole('button', { name: 'Timetable' }).click();
    await expect(page.getByTestId('slot')).toHaveCount(25);

    // At the smallest window the grid scrolls, so the last period can still be reached.
    await page.setViewportSize({ width: 1280, height: 690 });
    const lastSlot = page.getByTestId('slot').last();
    await lastSlot.scrollIntoViewIfNeeded();
    await expect(lastSlot).toBeInViewport({ ratio: 1 });
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
