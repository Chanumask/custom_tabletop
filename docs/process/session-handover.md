# Session Handover

← [CLAUDE.md](../../CLAUDE.md) · [process index](README.md)

Any session that ends with work still in flight leaves the next one a single, unambiguous starting point — so picking up is "read the handover, verify it, go", not "reconstruct what the last session was doing."

## Where the handover lives

The trailing block of the **newest entry in [`docs/changelog.md`](../changelog.md)**, headed `**Next session** →`.

The standard session-start read (per [CLAUDE.md](../../CLAUDE.md)) already reads the live `changelog.md` in full, so the handover is picked up for free.

## When to write one

End the session's changelog entry with a `**Next session** →` block whenever any of these is true at session end:

- a feature branch is left open (work committed but not merged),
- a multi-step task is only partway done,
- a dev server or other process was left running for the next session to use,
- a decision or user input is pending that blocks the next step,
- anything else where the next session would otherwise have to infer intent.

If the session ends genuinely clean — everything merged, nothing pending — **do not** write the block. Its presence is the signal there's something to pick up.

## Template

```
**Next session** →

Paste-to-start prompt:
> <one or two sentences the user can paste verbatim to kick off the session>

- **Branch:** <name, or "main — none open">
- **State:** <what's done, 1–3 lines>
- **Do next:** <ordered, concrete steps>
- **Watch for:** <known gotchas relevant to those steps>
- **Environment:** <dev server running? what to verify before trusting it>
```

## Using it (next session)

1. Do the standard session-start read (`decisions.md` + `changelog.md` in full, then the relevant category docs).
2. If the newest changelog entry has a `**Next session** →` block, that is the session's focus — act on it rather than asking the user, unless something's clearly changed.
3. **Verify the stated environment before trusting it.** Machine may have rebooted, a process may have died — check before building on a claim.
4. Don't edit or delete the old block. Your session writes its own newer entry, with its own handover block if it too leaves work in flight.
