# Landing page versions

Each version is a git tag. To look at an old one without touching your current work:

```bash
git worktree add ../kraddle-landing-v2 landing-v2
```

Then run `pnpm install` and `pnpm dev` inside `../kraddle-landing-v2/site`. Remove it later with `git worktree remove ../kraddle-landing-v2`.

| Tag | Date | What it was |
| --- | --- | --- |
| `landing-v2` | 2026-09-29 | Full-hero dot field, pinned "too little / too much / out of date / exactly enough" scroll, map-based how it works, orange in-practice windows, FAQ, giant wordmark footer. |

v1 (the first text-heavy draft) was replaced before versioning started and isn't kept.
