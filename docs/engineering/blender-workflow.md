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

**Built** (2026-09-23, M3 part 2). The room is modeled entirely by driving Blender's Python API over MCP (`execute_blender_code`) — no manual work in the Blender UI — matching `PLACEHOLDER_ROOM_LAYOUT`'s dimensions exactly so it's a pure asset swap. Source at `blender/room.blend` (repo root, not under `client/public/` — it isn't a web asset). Export at `client/public/models/room.glb`, loaded via `RoomLoader.ts`'s `gltfUrl` option (now the default in `RoomView.tsx`).

### The round trip

1. **Start Blender** if it isn't running (the addon's socket server auto-starts with it on `localhost:9876`). Per-session ritual: one `get_scene_info` read, then `disable_telemetry`.
2. **Build/edit geometry** via `execute_blender_code`. Gotcha hit and fixed this session: `bpy.ops.mesh.primitive_*_add(size=1)` shapes have **half-extent 0.5**, so `.scale = (desired/2, ...)` silently halves everything again — the correct scale factor equals the *desired full size*, not half of it. Verify dimensions with `get_object_info`'s `world_bounding_box` (not just a viewport screenshot) before exporting.
3. **Export**: `bpy.ops.export_scene.gltf(filepath=..., export_format='GLB', use_selection=False)` (the MCP `export_scene` tool works too, but doesn't expose `export_lights` — call `bpy.ops.export_scene.gltf` directly via `execute_blender_code` when you need that flag). **Do not set `export_lights=True`** — see the lighting note below.
4. **Wire it in**: point `loadRoom({ gltfUrl: '/models/room.glb' })` at the file (already done in `RoomView.tsx`); Vite serves anything under `client/public/` at the site root, no build step needed.
5. **Verify visually in a real browser**, not just `sanity-check` — this is a rendering change; type-checks and unit tests don't catch a black or overexposed room. This session used Chrome browser automation (`claude-in-chrome` skill) to load the page, join a session, and screenshot the result, catching a real lighting bug (see below) that no other check would have.

### Lighting: keep it out of the glb

Exporting Blender's point lights into the glTF (`export_lights=True`) converts Blender's Watt-based `light.energy` into `KHR_lights_punctual` candela values via a fixed watts→lumens constant — a modest 600W Blender light becomes ~30,000 cd. Three.js's renderer is physically-correct by default (light units are real photometric SI units), and with no tone mapping configured that blows straight to flat white on nearby surfaces while anything outside a light's falloff stays pitch black. Verified this directly: overexposed floor, correct-looking pedestal (grazing light, stayed dark) — a giveaway that it's a unit/exposure problem, not a missing-light problem.

**Fix used:** export geometry/materials only (`export_lights=False`, the default). Scene lighting lives in `client/src/three/RoomLighting.ts` — a `HemisphereLight` plus two `PointLight`s tuned directly in Three's units against `renderer.toneMapping = THREE.ACESFilmicToneMapping` (set in `RoomView.tsx`). Any future Blender asset for this project should follow the same split: geometry/materials from Blender, lighting from Three.js code.

### Concurrent Blender MCP sessions

The addon's socket server (`localhost:9876`) is a **single shared instance** — any session with the `blender` MCP tools loaded drives the *same* live Blender document, with no per-session isolation or locking. This session hit it directly: a background subagent kept running after being told to stop, and built its own furniture in the same live scene concurrently, leaving ~82 mismatched objects to clean up. If `get_scene_info` ever shows more objects than expected, or names you don't recognize, suspect this before debugging your own script — don't assume a live Blender connection is exclusive.
