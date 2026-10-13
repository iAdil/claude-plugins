---
name: hours
description: Write a timesheet / hours entry from the time work-helper tracked per project, the tasks finished and the day's git commits. Use when the user says "hours", "/hours", "timesheet", "time entry", "worklog", "how long did I work on X today", or "запиши часы".
---

# Hours from tracked time

1. Call `mcp__work-helper__time_report` (pass `date` as `YYYY-MM-DD` for a day other than today). It lists active time per project and the tasks finished there.
2. For each project in the report, read that day's commits: `git -C <project path> log --since="<date> 00:00" --until="<date> 23:59" --author="$(git config user.email)" --format=%s`. Project paths are in `~/.claude/project-registry.md`.
3. If the `hours-entry` skill is available, write the entry in its format. Otherwise write one line per project of about 800 characters: comma-separated, plain language, saying what was actually done, with no time figures inside the text.
4. Above each line, give the project name and the tracked time rounded to the nearest 15 minutes (2h 07m → 2h). Say plainly that the time comes from Claude Code activity only, so work done outside it isn't counted.
