import type { CSSProperties } from 'react';
import type { SubjectColors } from '../../domain/subjectColor';

/** The class and style that color an element as a subject (SYSTEM_DESIGN §10.5): the
    palette's `subject-<key>` class, and for custom colors the same three variables that
    class sets, inline. Custom colors are the user's data, not design tokens, so they're the
    one place a color isn't a token. `className` is the element's own classes, put first. */
export function subjectColorProps(
  colors: SubjectColors,
  className = '',
): { className: string; style?: CSSProperties } {
  const classes = [className, `subject-${colors.key}`].filter(Boolean).join(' ');
  if (!colors.custom) return { className: classes };
  return {
    className: classes,
    style: {
      '--card-bg': colors.custom.bg,
      '--card-bar': colors.custom.bar,
      '--card-ink': colors.custom.ink,
    } as CSSProperties,
  };
}
