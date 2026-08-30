# Project rules — Coffee Passport

## Audit Checkpoints ("Контрольные аудиты")

This project uses a checkpoint file, `.last_audit`, to track the last
commit that was fully audited. The rules below govern how any agent
(Claude Code or otherwise) must run an audit in this repo.

### Trigger

Run this procedure whenever the user asks for a **"Daily Check"**,
**«Проверь сегодняшнюю работу»**, or an equivalent request for an audit of
recent work — regardless of phrasing, and regardless of how much time has
actually passed since the last audit (could be hours or weeks; the range is
always defined by commits, never by calendar days).

### Mechanics: checkpoint-to-checkpoint ("от аудита до аудита")

- `.last_audit` (repo root) holds exactly one line: the full git commit
  hash that HEAD pointed to when the previous audit last completed
  successfully.
- On trigger:
  1. Read `.last_audit` for `<last_audit_hash>`.
     - If the file doesn't exist yet, this is the **initial baseline
       audit** — there is no prior checkpoint to diff from. Still run
       every check below; report recent history from `git log` instead of
       a `<hash>..HEAD` range, and note explicitly in the report that this
       is the baseline.
  2. Run `git log <last_audit_hash>..HEAD --oneline` — this is the
     **complete** set of commits to audit. Never truncate it and never
     substitute a "recent N commits" shortcut; the whole point of the
     checkpoint is that nothing merged since the last audit is skipped,
     no matter how large the range has grown.

### Procedure (run in this order)

1. **`git status`** — check for uncommitted changes. Report them plainly
   (files touched, staged vs. unstaged); do not treat this as a failure by
   itself, but flag it prominently since anything uncommitted is invisible
   to the commit-range diff in step 2 above until it's actually committed.
2. **`npx tsc --noEmit`** and **`npm run build`** — both must be run; report
   the actual pass/fail outcome of each, not an assumption. A build failure
   makes the audit unsuccessful (see checkpoint update rule below).
3. **Generate the final report**, containing at minimum:
   - Build status (tsc + `next build`, pass/fail, with the actual error
     output if either failed).
   - The list of features/fixes implemented in the audited commit range
     (one line per commit or per logical feature, derived from the commit
     log — don't just paste `git log` output verbatim, summarize what each
     commit actually did).
   - Current branch name.
   - Sync status with `origin/main` (ahead/behind/diverged/up to date —
     `git status -sb` or `git rev-list --left-right --count` against the
     remote).
4. **Checkpoint update** — only after the report is generated **and** the
   build passed: overwrite `.last_audit` with the current `HEAD` commit
   hash (`git rev-parse HEAD`). If the build failed, or if step 1 found
   uncommitted changes that materially affect the audit, leave
   `.last_audit` untouched so the next audit re-covers the same ground
   plus whatever comes after.

### Notes for whoever runs this

- `.last_audit` is intentionally tracked in git (not gitignored) — the
  checkpoint should be shared across sessions and machines, not per-clone
  state.
- Never hand-edit `.last_audit` to a hash that isn't real `HEAD` output
  from this repo; the whole mechanism depends on it being an exact,
  verifiable git commit hash.
