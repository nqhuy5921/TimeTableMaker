# PF: Profiles

**Status:** Drafted at R4-0 on 2026-10-28 from the user's request (a profile screen to switch between timetables and to import into). The user asked for profiles in release 4, ahead of the import in release 5, and approved PF-1 to PF-3 on 2026-10-28, including the points marked "proposed".

## Goal

You can keep several timetables side by side, such as this year's and a draft for next term, and switch between them. Each one is a profile.

## User stories and acceptance criteria

**PF-1. A profile is a whole timetable.** Each profile has its own classes, teachers (with their conditions), subjects, rooms, card pool, and grid (decided 2026-10-28). Nothing is shared between profiles, so a change in one never shows in another.
- Each profile is saved in its own file in the app's data folder, as the timetable is today, with its own backup and the same damaged-file screen if it can't be read.
- The app reopens the profile you last had open, on the class you last had on screen in it.
- The export's school name, school year, and dates ([IE-2](04-import-export.md)) are remembered per profile.

**PF-2. The profile screen.** As the coordinator, I can see, open, add, and change profiles on a profile screen.
- The header shows the open profile's name, and clicking it opens the profile screen (proposed 2026-10-28).
- The profile screen lists every profile with its name, how many classes and cards it has, and when it was last changed, with the open one marked.
- **Open** switches to a profile. The timetable screen then shows its first class by grade, or the class last on screen in it.
- **New profile** asks for a name and starts an empty timetable.
- **Duplicate** copies a profile, everything in it, under a new name you give.
- **Rename** changes a profile's name. Two profiles can't have the same name; case doesn't count, accents do, as for rooms.
- **Delete** asks first, naming the profile and saying how many classes and cards go with it. The open profile can't be deleted; open another one first (proposed 2026-10-28). The last profile can't be deleted either.
- In release 5, the profile screen is where an import starts: into the open profile or into a new one ([IE-1](04-import-export.md)).

**PF-3. Nothing is lost.** The first time release 4 opens, the existing timetable becomes a profile named "Timetable", which you can rename (proposed 2026-10-28). Everything in it stays as it was, and the file before the change is kept as a copy.

## Open questions

None for now.
