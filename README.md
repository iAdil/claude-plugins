# Claude Code plugins

Plugins for [Claude Code](https://claude.com/claude-code), published as one marketplace (`adil-plugins`).

## work-helper

Keeps what you are working on in view while Claude Code runs.

```
▶ Add photo stories ██████░░░░ 60% · 3/5 · now: Write story expiry test
⏭ Next: Like button on feed posts (+2 more)
✓ Last: added story upload endpoint and 24h expiry job
5h   ████████░░░░░░░░░░░░   62% left · resets in 2h 14m
week ██████████████████░░    9% left · resets in 3d 4h
ctx  ████████████░░░░░░░░   62% used · 124k / 200k tokens
tokens ≈ $3.50 at API prices · session 2h 0m · $1.75/h · today on instagram: 3h 12m
```

- **Project in the status line**: the current project's name, framework and git branch. Projects are matched against `~/.claude/project-registry.md` (a Markdown table with `Name | Path | Framework | Runtime | … | URL` columns) when you have one; otherwise the git repository's folder name is shown.
- **Task queue per project**: say "add task …" and Claude splits it into steps and queues it. The band shows the active task's progress and what is next; Claude ticks steps off as it finishes them.
- **Last turn summary**: a few words on what the last turn did. Short final messages are shown as they are; longer ones are summarised by one small Haiku call, which counts toward your usage. Interrupted turns and subagent runs leave it unchanged.
- **Usage limits**: how much of the 5-hour and weekly limits is left, and when each resets. Shown on a Claude subscription.
- **Context meter**: how full the context window is.
- **Token cost**: what the session's tokens would cost at API prices. On a subscription this is not what you pay; it shows how heavy the session is.
- **Time tracker**: active time per project per day (gaps over 15 minutes count as away). `/time` shows today's totals; say "hours" or "timesheet" and Claude writes a timesheet entry from the tracked time, finished tasks and the day's commits.
- **Budget alerts**: a notification when a usage limit passes 80% (and 95%), when the session's token cost passes another $20, and when the context window passes 85%.
- **Done ping**: a desktop notification when a turn that took over 2 minutes finishes.
- **Docker pane**: `/docker` opens a pane with the project's containers and Start / Stop / Refresh buttons (Laravel Sail projects are started through Sail).

### Install

In a Claude Code terminal session:

```
/plugin install work-helper --marketplace iAdil/claude-plugins
```

Answer `y` to add the marketplace, then pick a scope: **user** loads it in every session.

### Settings

Every feature can be turned off, and every threshold changed, in `/config` (look for the work-helper rows). A change applies immediately.

| Setting | Default |
| --- | --- |
| Status line: project, Task queue, Last turn summary, Usage limits, Context meter, Token cost, Time tracker, Docker pane, Budget alerts, Done ping | on |
| Cost alert step ($) | 20 |
| Limit alert (%) | 80 |
| Context alert (%) | 85 |
| Done ping after (s) | 120 |

To turn the whole plugin off, use `/plugin`.

### Update

Turn on auto-update for the `adil-plugins` marketplace in `/plugin` → Marketplaces to get new versions when Claude Code starts. To update by hand:

```
/plugin marketplace update adil-plugins
/plugin update work-helper@adil-plugins
/reload-plugins
```

### Notes

- Done ping and budget alerts use your system notifications; if none are set up for your terminal, you will only see the in-terminal toast.
- The Docker pane needs `docker` on your PATH and finds containers started by `docker compose` (or Sail) from the project's folder.

## License

[MIT](LICENSE)
