# Claude Code plugins

Personal Claude Code plugins, published as one marketplace (`adil-plugins`).

| Plugin | What it does |
| --- | --- |
| [work-helper](plugins/work-helper) | Status line with the current project (from `~/.claude/project-registry.md`) and git branch; a band above the prompt with the project's task queue (active task %, next task) and 5-hour / weekly usage left; `add-task` skill |

## Install

In a Claude Code terminal session:

```
/plugin install work-helper --marketplace iAdil/claude-plugins
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

## Develop

```
claude plugin validate plugins/work-helper
claude plugin test plugins/work-helper
claude --plugin-dir plugins/work-helper
```
