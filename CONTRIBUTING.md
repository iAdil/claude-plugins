# Maintaining these plugins

## Develop

```
claude plugin validate plugins/work-helper
claude plugin test plugins/work-helper
claude --plugin-dir plugins/work-helper
```

## Release

1. Raise `version` in the plugin's `.claude-plugin/plugin.json`. Claude Code compares it with the installed version to decide whether there is an update, so a push without a new version does not reach anyone.
2. Commit and push to `main`.

Users with auto-update on get it on their next start; the rest when they run the update commands in the README.
