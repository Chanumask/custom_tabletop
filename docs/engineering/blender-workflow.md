# Blender Workflow

← [CLAUDE.md](../../CLAUDE.md) · [engineering index](README.md)

How the room/table/furniture assets get made: Blender, driven over MCP, exported as **glTF/GLB**, loaded client-side with Three.js's `GLTFLoader`. This is a different export target than the sibling `extraction_project` repo's Blender pipeline (which goes Blender → FBX → Unreal) — see [decisions.md](../decisions.md) for why the MCP *setup* is reused as-is but the export/import mechanics are not. [[feedback-reuse-extraction-project-docs]] is the standing instruction behind checking that repo first.

## Setup (2026-09-23, reusing an existing install)

Blender 5.2, the "MCP for Blender" add-on, and `uvx` were **already installed on this machine** for `extraction_project` — nothing new was installed for this repo, only this repo's own `.mcp.json` was added to register the same server:

| Part | What | Where |
|---|---|---|
| Blender | 5.2 | `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` |
| Add-on | "MCP for Blender" (`ahujasid/mcp-for-blender`), protocol 7 | `%APPDATA%\Blender Foundation\Blender\5.2\scripts\addons\blender_mcp.py` — already enabled from the `extraction_project` setup |
| Server | `mcp-for-blender@2.0.0`, run by `uvx` | registered as `blender` in **this repo's own** `.mcp.json` (stdio) |

- The add-on is a socket server in Blender on `localhost:9876` with auto-start on, per `extraction_project`'s notes — starting Blender is all it takes.
- **MCP servers load at session startup, not hot-reloaded.** The session that added this repo's `.mcp.json` does not have the `blender` tools — a fresh session is needed before they show up. Check with `ToolSearch` or by looking for `blender`-prefixed tools; if absent, that's the signal, not a config problem.
- Per-session ritual (same as `extraction_project`): one cheap read call (`get_scene_info`) first, then `disable_telemetry` — it does **not** persist across a Blender restart, so this is a repeat-every-session step.

## What's different from `extraction_project`'s pipeline

That repo's `docs/engineering/blender-workflow.md` (a sibling repo, not part of this one — not a clickable link here since it isn't in this repo or its remote) targets Unreal: FBX export, `SkeletalMeshTools`/`StaticMeshTools` MCP import calls, an FBX ×100 cm-scale bake to dodge an Unreal-specific unit trap, Unreal materials/Nanite/World Partition saves. **None of that applies here.** This project's target is:

- **Export format: glTF/GLB**, not FBX. Blender's glTF exporter is Y-up and meter-scaled natively — the cm-scale bake trap `extraction_project` works around doesn't exist for this target, but glTF export has its own conventions worth confirming empirically once real export starts (axis orientation, whether `use_active_scene=True` is needed — `extraction_project`'s own notes flag that the glTF exporter exports every scene otherwise, from when they evaluated it as an alternative).
- **Import: Three.js `GLTFLoader`** client-side (`client/src/` — the room-loading code lands in Milestone 3), not an engine-side MCP import call. Once a `.glb` is exported to disk, getting it into the running app is a normal client asset-loading concern, not something MCP does.
- **No Unreal-specific material/collision/Nanite concerns.** Materials are whatever glTF/Three.js materials the export carries over; collision is handled in the Three.js physics/collision layer the client builds, not an engine collision-complexity flag.

## Status

**Not yet built.** M3 (see [roadmap.md](../roadmap.md)) split into two parts because of the fresh-session requirement above:

1. **Movement/collision engine**, buildable immediately, tested against a procedural (non-Blender) placeholder room built directly in Three.js — doesn't need live Blender/MCP access at all.
2. **The actual Blender-built room + table**, which needs a fresh session (for the `blender` MCP tools to load) to actually drive Blender and produce the `.glb`, then swap it in for the procedural placeholder from step 1.

This file gets filled in with the real round-trip procedure (the equivalent of `extraction_project`'s "The round trip" section) once step 2 actually happens — don't assume it works a particular way before that's proven.
