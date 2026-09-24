# Source assets (not tracked)

Raw third-party asset packs live here locally but are **gitignored** (~500 MB, and re-downloadable). Only what's derived from them is tracked:

- `blender/*.blend` — the editable Blender sources built from these packs
- `client/public/models/*.glb` — the optimized runtime exports the client actually loads

To rebuild from scratch, download the packs below and unzip them into this folder with their original folder names.

| Pack | Author | License | Download | Used for |
|---|---|---|---|---|
| Ultimate Modular Men (Feb 2022) | Quaternius | CC0 1.0 | https://quaternius.com/packs/ultimatemodularcharacters.html | Player character models |
| Ultimate Modular Women (April 2022) | Quaternius | CC0 1.0 | https://quaternius.com/packs/ultimatemodularwomen.html | Player character models |

Textures/props pulled in through the Blender MCP's Poly Haven integration (CC0) are baked into the tracked `.blend`/`.glb` files directly and listed in [docs/engineering/blender-workflow.md](../../docs/engineering/blender-workflow.md).
