// The screens in the header menu. Switching screens is app state; there are no URLs.

export type MenuScreenId = 'timetable' | 'cards' | 'teachers' | 'classes' | 'rooms' | 'subjects';

/** The menu's screens, the profile screen, opened from the header's profile pill, and the
    Import screen, opened from the profile screen. */
export type ScreenId = MenuScreenId | 'profiles' | 'import';

export interface ScreenInfo {
  id: MenuScreenId;
  label: string;
}

export const SCREENS: readonly ScreenInfo[] = [
  { id: 'timetable', label: 'Timetable' },
  { id: 'cards', label: 'Cards' },
  { id: 'teachers', label: 'Teachers' },
  { id: 'classes', label: 'Classes' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'subjects', label: 'Subjects' },
];
