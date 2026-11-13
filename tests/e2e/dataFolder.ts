import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Where the app keeps a timetable (SYSTEM_DESIGN §11.1). Tests write a release 3 data
// folder (`timetable.json` and `settings.json` in the folder itself), which the app moves
// into a profile on start, and read what it saved from the open profile's folder.

/** The open profile's folder in a data folder the app has started on. */
export function profileFolder(userData: string): string {
  const list = JSON.parse(readFileSync(join(userData, 'profiles.json'), 'utf8')) as {
    openId: string;
  };
  return join(userData, 'profiles', list.openId);
}

/** A file in the open profile's folder, `timetable.json` unless named. */
export const savedPath = (userData: string, name = 'timetable.json') =>
  join(profileFolder(userData), name);

/** Writes the timetable a test starts from: into the data folder itself before the first
    start (a release 3 folder), and into the open profile once the app has made one. */
export function seedTimetable(userData: string, text: string): void {
  const started = existsSync(join(userData, 'profiles.json'));
  writeFileSync(started ? savedPath(userData) : join(userData, 'timetable.json'), text);
}

/** The files the app keeps in a data folder, leaving out Electron's own. */
export const appFiles = (userData: string) =>
  readdirSync(userData)
    .filter((name) => /^(profiles|timetable|settings)/.test(name))
    .sort();

/** Makes the data folder and every profile folder writable again, after a test that made
    one read-only, so it can be removed. */
export function unlockProfiles(userData: string): void {
  chmodSync(userData, 0o755);
  try {
    for (const name of readdirSync(join(userData, 'profiles'))) {
      chmodSync(join(userData, 'profiles', name), 0o755);
    }
  } catch {
    // No profiles yet.
  }
}
