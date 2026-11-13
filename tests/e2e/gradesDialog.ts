import { expect, type Page } from '@playwright/test';

// The Grades dialog (DM-8), opened from the Classes page or the class bar's Add grades.

export const gradesDialog = (page: Page) => page.getByRole('dialog', { name: 'Grades' });

/** Adds a grade through the open Grades dialog's Add grade form, back to its list. */
export async function addGrade(page: Page, grade: string) {
  await gradesDialog(page).getByRole('button', { name: 'Add grade' }).click();
  const form = page.getByRole('dialog', { name: 'Add grade' });
  await form.getByLabel('Grade').fill(grade);
  await form.getByRole('button', { name: 'Add grade' }).click();
  await expect(gradesDialog(page).getByText(`Grade ${grade}`, { exact: true })).toBeVisible();
}
