---
name: add-task
description: Add a task to the current project's work-helper queue, shown above the prompt with its progress and what is up next. Use when the user says "add task", "добавь задачу", "queue this", "next task", "put X on the list", or asks what is in the task queue.
---

# Add a task

The work-helper mod keeps one task queue per project (the registry row, else the git root, else the directory). The first task is active: the band above the prompt shows its % done (steps done ÷ steps) and the next task.

1. Take the task from the user's words. If it is too vague to split into steps, ask one short question.
2. Split it into 3-7 concrete steps, each one you can verify as done (e.g. "Add migration for `auth_code`", "Write test for the expired-code case").
3. Call `mcp__work-helper__task_add` with `title` (under 60 characters), `steps` and `position`: `next` when the user says it goes next or is urgent, otherwise `end`.
4. Reply with the queue the tool returned, in one or two lines.

Adding a task does not start it. Work on the active task only when the user asks. While you do, call `mcp__work-helper__task_step_done` with each step's number as soon as it is finished. Call `mcp__work-helper__task_finish` only when the user says the task is done or should be dropped.
