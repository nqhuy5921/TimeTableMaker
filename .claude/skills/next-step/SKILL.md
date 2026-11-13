---
name: next-step
description: Keeps TimeTableMaker's roadmap (docs/ROADMAP.md) current and shows the user what to do next. Use it as soon as a roadmap step's work is finished and verified (checks and e2e pass), so the step gets ticked and the next one is shown without the user asking. Also use it whenever the user asks what's next, where the project stands, what the plan is, which phase or step we're on, or wants to change, split, add, or reorder steps. Use it too when finished work doesn't match any step, so the roadmap can be brought back in line.
---

# Next step

The user wants a written plan they can follow, and wants you to take the lead: when a step is finished, say what comes next instead of waiting to be asked. `docs/ROADMAP.md` is that plan. This skill keeps it true and turns it into a clear "here's the next step" message.

## When a step has just been finished

1. **Check it's really done.** Read the step's **Covers** and **Done when** in `docs/ROADMAP.md`. Confirm with evidence from this session: `npm run check` and `npm run test:e2e` pass (run in the Terminal panel's "checks" tab), every acceptance criterion the step covers has a test, `CHANGELOG.md` names the requirements, UI work was looked at in the running app, and `/code-review` ran on the step's changes with its findings shown to the user and fixed (or settled with them). The review comes before the tick, every step, as it did through release 1 (the user asked on 2026-10-22, after R2-1 was ticked without one). If it hasn't run, run it, show the findings, and offer to fix them before ticking. If something is missing, don't tick the step. Say what's left and offer to finish it. A ticked step that isn't really done misleads the next session.
2. **Update the roadmap.**
   - Change the step's `[ ]` or `[~]` to `[x]` and add today's date after the title.
   - If the work differed from what the step said (scope moved, something deferred), edit the step so it records what was actually built, and move any leftover work into a later step or **Open items**.
   - Move the **Next step:** line at the top to the next `[ ]` step.
   - Add anything you noticed but didn't do to **Open items**, worded so the user can decide on it later.
3. **Update CLAUDE.md's Current state** in a sentence or two: what now works and which step is next. CLAUDE.md asks for this at the end of every phase, and the next session reads it first.
4. **Open the app for the user.** In the Terminal panel, stop the previous "app" tab if there is one, and close any copy an earlier session left running (`pkill -f "TimeTableMaker/node_modules/.bin/[e]lectron-vite dev"`, through Bash), then run `npm run dev` in a new tab titled "app" (`run_in_terminal`), so the user can try the finished step. Link the tab in the message. CLAUDE.md's **Terminal panel** section has the details.
5. **Show the next step** (format below).

## When the user asks what's next or where things stand

Read `docs/ROADMAP.md` and CLAUDE.md's **Current state**. If they disagree with the code or with each other, for example a step marked not started that's clearly built, fix the roadmap first and say what you changed. Then show the next step.

## When the user wants to change the plan

Edit the steps in `docs/ROADMAP.md` directly: add, split, merge, reorder, or drop them. Keep the IDs stable for steps that already exist, so earlier references still make sense. Give new steps the next free number in their release, or a suffix like `R1-3b`. If a change drops or changes a requirement, the requirement docs and `SYSTEM_DESIGN.md` need the same change, with the date, as was done when TB-6 was removed.

## Showing the next step

Keep it short enough to read at a glance:

```
**Done:** R1-1 — App state and class picker ✓ (one line on what now works)

**Next: R1-2 — Saving** (covers TB-7)
- What gets built, as 3–5 bullets in plain words
- Done when: how we'll know it works
- Gate: anything the user must approve first, or "none"
- To settle first: open questions from the requirements or Open items that affect this step, if any
```

Then offer to start it. Where the app gives you a next-step box or buttons, put "Start R1-2" first. Don't start the next step on your own: the user may want to review the finished one, reorder, or stop. Being proactive here means showing the step and making it one click to begin, not starting the work.

A step with a **Gate** (requirements or design approval, sign-off) can't start until the user approves. Put the approval in the offer itself, for example "Approve the TC criteria so we can design release 2?", rather than offering to start building.

## Why the roadmap and not just memory

The plan has to survive between sessions and be readable by the user. So the roadmap file is the source of truth, and CLAUDE.md's **Current state** is the short summary. Keep the two in step, and don't keep the plan only in your head or in chat.
