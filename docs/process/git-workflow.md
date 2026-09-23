# Git Workflow

← [CLAUDE.md](../../CLAUDE.md) · [process index](README.md)

`main` took one initial scaffolding commit (docs/config only) directly. Since then: **documentation-only changes may commit straight to `main`** (`docs/`, `CLAUDE.md`, `README.md`, `.claude/` — no application code riding along in the same commit). Everything else — any change under `client/`, `server/`, or `shared/` — goes through a feature branch.

## Branch naming

`<type>/<short-topic>`, using the same types as commits: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `style`.

Examples: `feat/session-join`, `fix/drawing-desync`, `chore/eslint-setup`.

## Scope discipline

One branch = one topic. If something unrelated turns up while working a branch, it does **not** ride along on the current branch's commits — it gets its own branch off up-to-date `main`, even if that means holding two branches in flight.

## When to branch / merge — recognized automatically, not asked for

- **Documentation-only change** → may commit directly to `main`. If bundled with actual code, the whole thing goes through a branch.
- **Any change under `client/`, `server/`, `shared/`** → always a feature branch.
- **New task or topic that isn't a continuation of the currently open branch** → new branch from up-to-date `main` before writing anything.
- **Branch's task is done and sanity checks pass** → merge back into local `main` without waiting to be told (local-only, reversible — same pre-authorization as commits).
- **Pushing** `main` or any branch always needs an explicit, per-instance ask.

## Merge-back checklist

Before merging a feature branch into `main`:

1. Rebase (or merge `main` in) so the branch is current — resolve conflicts on the branch.
2. Run the sanity pass (see [`sanity-check`](../../.claude/skills/sanity-check/SKILL.md)): lint/format clean, tests passing.
3. Re-check scope: every changed file should belong to the branch's one topic.
4. Update `docs/decisions.md` and/or `docs/changelog.md` if the branch introduced a decision or a notable change.
5. Squash-merge into local `main`, so `main`'s history reads as one Conventional-Commit-styled entry per feature.
6. Delete the feature branch locally once merged.
7. Ask before pushing `main` (and before pushing/deleting anything on the remote — this repo has no remote configured yet; that's its own decision to make when it's time).

## Commit conventions

Commits are pre-authorized and use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, types `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `style`. Body explains *why* when it's not obvious from the diff. This doc only covers how branches carry those commits back to `main`.
