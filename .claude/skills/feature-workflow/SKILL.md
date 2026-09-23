---
name: feature-workflow
description: Run a single feature, fix, or other concrete change through this repo's standard end-to-end sequence — branch, inspect, evaluate alternatives, implement, test, lint, document, commit, merge back. Use this whenever starting real implementation work in this repo (client, server, or shared code), instead of improvising an ad hoc sequence of git commands.
---

# Feature Workflow

The standard sequence for turning a task into a merged change in this repo. [CLAUDE.md](../../../CLAUDE.md) and [docs/process/git-workflow.md](../../../docs/process/git-workflow.md) are the authoritative policies this skill operationalizes — if anything here seems to conflict with them, those files win.

## The sequence

0. **Orient via the docs hierarchy.** Start at [CLAUDE.md](../../../CLAUDE.md), then follow it into whichever category index your task touches: [docs/process/](../../../docs/process/README.md), [docs/engineering/](../../../docs/engineering/README.md). Check [docs/roadmap.md](../../../docs/roadmap.md) for which milestone this task belongs to and what its exit check is.

1. **Branch.** Create `<type>/<short-topic>` off up-to-date `main`, using the Conventional Commit types (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `style`). No direct commits to `main` for application code.

2. **Evaluate alternatives.** Before writing code, check whether an existing pattern in the project already covers this. Check `docs/decisions.md` for anything already settled that constrains the choice.

3. **Implement.** Code changes scoped to this branch's one topic — one package (`client`, `server`, or `shared`) at a time where possible. If something unrelated turns up mid-task, that's a separate branch.

4. **Test.** Write tests for new code and actually run them.

5. **Lint/format.** Run the `sanity-check` skill and get it clean.

6. **Document.** If this branch introduced a decision worth remembering, or completed/changed a milestone, note it in `docs/decisions.md` / `docs/changelog.md` and update `docs/roadmap.md` if a milestone's scope shifted.

7. **Commit.** Conventional Commits, pre-authorized — no need to ask first.

8. **Merge back.** Rebase on current `main`, rerun the sanity pass, re-check scope, squash-merge into local `main`, delete the branch, then **ask before pushing** — that's the one step that always needs an explicit go-ahead, no exceptions.
