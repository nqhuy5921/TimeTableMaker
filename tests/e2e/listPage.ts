import type { Page } from '@playwright/test';

/** The rows of a list page's table (Classes, Rooms, Subjects), each as its cells' text
    joined by " | ", leaving out the Edit and Delete cell. A subject tag is written with its
    palette, "Toán (math)", or its custom colors, "Robotics (custom #ffeedd #112233)", so a
    test sees its colors too. */
export const listRowTexts = (page: Page, table: string) =>
  page
    .getByRole('table', { name: table })
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader') })
    .evaluateAll((trs) =>
      trs.map((tr) =>
        [...tr.children]
          .slice(0, -1)
          .map((cell) => {
            const tag = cell.querySelector('.subject-tag');
            const palette = [...(tag?.classList ?? [])]
              .find((c) => c.startsWith('subject-') && c !== 'subject-tag')
              ?.slice('subject-'.length);
            const text = cell.textContent ?? '';
            // The tests' types have no DOM, so the element's style is read through a cast.
            const style = (tag as { style?: { getPropertyValue(name: string): string } } | null)
              ?.style;
            const bg = style?.getPropertyValue('--card-bg') ?? '';
            if (bg) return `${text} (custom ${bg} ${style?.getPropertyValue('--card-ink')})`;
            return palette ? `${text} (${palette})` : text;
          })
          .join(' | '),
      ),
    );
