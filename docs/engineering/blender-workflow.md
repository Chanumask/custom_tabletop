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

## Setup on the current machine (2026-09-24)

The machine the project moved to had none of the above: install `uv` (`winget install --id=astral-sh.uv -e`), then `uvx mcp-for-blender@2.0.4 install-addon`, enable "MCP for Blender" in Blender's add-on preferences (it auto-starts its socket server on launch), and restart the Claude app. `.mcp.json` pins `mcp-for-blender@2.0.4` with `DISABLE_TELEMETRY=true`. The package is ahujasid's renamed `blender-mcp`; its **Poly Haven** integration (CC0 textures/models, no key) is what dressed the room. Poly Haven is a *per-scene* toggle (`scene.blendermcp_use_polyhaven = True`) — reopening a .blend resets it. If the MCP server version and the add-on's protocol disagree, some wrapper tools break (seen: `search_polyhaven_assets` passing `categories` vs. `category`) — the public API (`https://api.polyhaven.com/assets?t=models`) plus `download_polyhaven_asset` still work.

## Room conventions the client depends on (2026-09-24 rework)

The client reads gameplay geometry **out of the exported model by object name** (`client/src/three/RoomLoader.ts`'s `describeRoom`) — keep these names when editing the room:

| Object | Meaning in the game |
|---|---|
| `COL_*` | Invisible collision footprint (its XZ bounding box becomes an obstacle; hidden at load). Add one for every piece of furniture a player shouldn't walk through. |
| `Table_Top` | The play surface. Its bounding box *is* the map/drawing area (center, half-width/depth, height) — the canvas texture, UVs, drawing raycasts, dice spawns and the seated camera all derive from it. |
| `Whiteboard_Surface` | The whiteboard's writable quad (UV 0..1 across it, facing into the room). |
| `Chandelier` | Hidden while a player is seated (it hangs where the top-down camera sits). |
| `Floor` / `Ceiling` | Walkable bounds / wall height. |
| `TV_Screen` | The console TV's screen quad — shared YouTube clips play on it (TvScreen.ts). |
| `Window_View` | The window pane — the client paints a starry night sky on it. |
| `Fireplace_Fire` / `Fireplace_Embers` | Where the animated fire, sparks and fire light go; the ember bed's glow flickers with it. |
| `Flame_*` | Candle and lamp flames — made unlit, flickering and haloed; nearby flames share a light. |
| `Glow_*` | Other soft light sources to halo (the lanterns). |
| `Beam_*` | Ceiling beams — fairy lights are strung along them. |

**Texture pipeline:** materials are plain Principled BSDFs wired UV → image textures (no Mapping/Displacement nodes — glTF can't carry them); tiling is done with world-scale box-projected UVs (`set_box_uv` in the build scripts). Packed textures are stored as ≤1024px JPEG (512px for small props) so `room.blend` stays ~22 MB. **Export (since 2026-09-25): `export_image_format='WEBP'`, `export_image_quality=80`, `export_meshopt_compression_enable=True`** — `room.glb` ~9.3 MB with ~230k triangles (the client registers `MeshoptDecoder`; browsers decode WebP natively). Gotchas when repacking images: `Image.save()` writes the image's *current* `file_format` whatever the path's extension says (set `file_format='JPEG'` first), and `reload()` re-reads the old *packed* data — load the saved file as a new image and `user_remap` to it instead. Poly Haven models also ship EXR maps and colour images with unused alpha channels (both bloat the .blend/.glb), `KHR_materials_transmission` on materials that don't need it (it forces three.js into an extra full-scene transmission pass every frame — the lantern's brass had transmission 1.0), and the chandelier's glass used an inverted alpha map into Transmission that exported a texture with no image (GLTFLoader then crashed) — replaced with plain alpha-blended glass. Watch for: Poly Haven props sometimes carry Subdivision modifiers (the candlestick shipped at level 3 = 213k triangles) and "glass" materials built from an Add Shader, which glTF exports as an opaque dark sheet (removed from the picture frames).

**Poly Haven assets used (all CC0, https://polyhaven.com):** textures `herringbone_parquet`, `wooden_panels`, `beige_wall_001`, `quatrefoil_jacquard_fabric`, `floral_jacquard`, `dark_wood`, `rough_pine_door`; models `gallinera_chair`, `wooden_bookshelf_worn`, `ArmChair_01`, `side_table_01`, `treasure_chest` (decimated to 20%), `vintage_grandfather_clock_01` (rig removed), `lantern_chandelier_01`, `hanging_picture_frame_01`/`02`, `potted_plant_04`, `wooden_candlestick`. **Cozy pass (2026-09-25):** textures `stacked_stone_wall`, `castle_wall_slates`, `oak_wood_planks`, `bark_brown_02`, `velour_velvet` (tinted burgundy), `wool_boucle`, `painted_plaster_wall` (tinted honey-ochre); models `sofa_03` (scaled 0.82), `Rockingchair_01`, `round_wooden_table_01` (scaled 0.45 as an end table), `tea_set_01` (teapot + two cups), `Lantern_01` (×2), `potted_plant_02` (×2), `brass_candleholders` (flames split into `Flame_*` objects), `mantel_clock_01` (rig and bone-shape widgets removed), `kite_shield`, `vintage_oil_lamp`. Built by script: the fireplace (stone surround and chimney breast, slate hearth, walnut mantel, logs, grate, emissive ember bed, `Fireplace_Fire` empty), the 1960s console TV (`TV_Screen` is an exact 0.76 × 0.57 m rectangle), the window (`Window_View`, painted by the client) with velvet curtains, the fireside rug, and candle sconces. **Quality pass (2026-09-25):**
- **The TV:** the console TV was replaced by `Television_01` (scaled 1.7, and 1.38 in depth, glass flattened behind a 0.615 × 0.461 m `TV_Screen`) on a sideboard. The sideboard is `vintage_cabinet_01` cut down to its lower half (everything above its 0.91 m countertop deleted, upper doors removed; `COL_TV` wraps it).
- **The shelf:** `book_encyclopedia_set_01` replaced the flat-colour book boxes. It's joined, decimated to about 700 triangles per 20 volumes, placed as linked `BookSet_A` (20) / `BookSet_B` (9) instances, and some are lying as stacks.
- **Rebuilt as brass lathe forms:** the sconces (oval backplate, bezier arm, drip pan) and the door knob.
- **Small fixes:** the whiteboard frame is walnut, and the four newer windows got curtains sized so they don't cover their narrow panes.

Poly Haven's model textures arrive as PNG. Convert them to JPEG before saving, as the pipeline says, but take the colour maps from Poly Haven's official 1k JPGs (`https://api.polyhaven.com/files/<id>`). `save_render` applies the scene's AgX view transform to sRGB images and darkened them; Non-Color maps come through unchanged.

## Status

**Reworked** (2026-09-24): square game table with rail, textured floor/walls/ceiling, wainscoting and trim, ceiling beams, door, furnished with the Poly Haven assets above, window removed, colliders authored as `COL_*` boxes. **Originally built** (2026-09-23, M3 part 2). The room is modeled entirely by driving Blender's Python API over MCP (`execute_blender_code`) — no manual work in the Blender UI — matching `PLACEHOLDER_ROOM_LAYOUT`'s dimensions exactly so it's a pure asset swap. Source at `blender/room.blend` (repo root, not under `client/public/` — it isn't a web asset). Export at `client/public/models/room.glb`, loaded via `RoomLoader.ts`'s `gltfUrl` option (now the default in `RoomView.tsx`).

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
