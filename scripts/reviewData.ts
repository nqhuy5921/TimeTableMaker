import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { REVIEW_CLASS_ID, reviewSchool } from '../fixtures/reviewSchool';
import { BEFORE_PROFILES_FILE, PROFILES_FILE, PROFILES_FOLDER } from '../src/main/profiles';
import { serializeTimetableFile } from '../src/shared/fileFormat';

// Writes the made-up review school (fixtures/reviewSchool.ts) as the one profile of a data
// folder of its own (SYSTEM_DESIGN §11.1) and, with --start, opens the app on it
// (`npm run dev:review`). It starts afresh each time, so changes made while reviewing
// don't carry over. Starting afresh deletes every timetable the folder holds, so it
// refuses the app's real data folder and any folder with profiles of its own. Written in
// Node rather than the npm script, so it works in any shell.
//
// Usage: jiti scripts/reviewData.ts [--start] [folder]

const args = process.argv.slice(2);
const start = args.includes('--start');
const folder =
  args.find((arg) => !arg.startsWith('--')) ?? join(homedir(), '.config', 'TimeTableMaker-review');

const profileId = 'review';
const profileFolder = join(folder, PROFILES_FOLDER, profileId);

if (resolve(folder) === resolve(homedir(), '.config', 'TimeTableMaker')) {
  console.error(`${folder} is the app's real data folder, so the review school isn't written.`);
  process.exit(1);
}
const list = await readFile(join(folder, PROFILES_FILE), 'utf8').catch(() => null);
if (list !== null && !isReviewList(list)) {
  console.error(
    `${folder} has profiles other than the review school, so it isn't written. ` +
      'Pass a folder of its own.',
  );
  process.exit(1);
}

/** True for a `profiles.json` this script wrote, with the review school as its one profile. */
function isReviewList(text: string): boolean {
  try {
    const { profiles } = JSON.parse(text) as { profiles?: { id?: unknown }[] };
    return Array.isArray(profiles) && profiles.every((p) => p.id === profileId);
  } catch {
    return false;
  }
}

// Everything the app keeps in it goes; nothing else in the folder is touched.
for (const name of [
  'timetable.json',
  'timetable.json.bak',
  'settings.json',
  BEFORE_PROFILES_FILE,
]) {
  await rm(join(folder, name), { force: true });
}
await rm(join(folder, PROFILES_FOLDER), { recursive: true, force: true });
await mkdir(profileFolder, { recursive: true });
await writeFile(
  join(folder, PROFILES_FILE),
  `${JSON.stringify({ profiles: [{ id: profileId, name: 'Review school' }], openId: profileId })}\n`,
  'utf8',
);
await writeFile(
  join(profileFolder, 'timetable.json'),
  serializeTimetableFile(reviewSchool),
  'utf8',
);
await writeFile(
  join(profileFolder, 'settings.json'),
  `${JSON.stringify({ selectedClassId: REVIEW_CLASS_ID })}\n`,
  'utf8',
);
console.log(`Review school written to ${folder}`);

if (start) {
  const app = spawn('electron-vite dev', {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, TTM_USER_DATA: folder },
  });
  app.on('exit', (code) => process.exit(code ?? 0));
}
