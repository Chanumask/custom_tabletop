# Changelog

← [CLAUDE.md](../CLAUDE.md)

Dated log of what happened each session. Newest first.

---

## 2026-09-25 (small hours) — TV on a sideboard, anyone moves minis and dice, chairs that scale, a quality pass

**Asked** (user):
- The TV "a bit higher, like on a sideboard".
- A normal player should be able to move the host's dice and mini.
- Chairs should scale with the lobby: 4 by default, more with more people, back down as they leave, never below 4.
- Check whether any model doesn't match the room's quality, and improve it.

### What landed

- **Moving things:** anyone moves any mini that's on the table and any die they can see. Putting a mini on or off stays with its owner or the host, and secret dice stay the owner's.
- **Quality pass:** close-ups of every object in the running app.
  - Replaced: the script-built console TV became a tabletop CRT on a carved sideboard, with the screen at eye level.
  - Also replaced: the pastel book boxes (now leather-bound volumes), the sphere-on-a-stick floor lamp (now a Victorian lamp with a glowing pleated shade), the ball-on-a-stick sconces, and the door's box handle.
  - Fixed: the whiteboard frame is walnut, and the newer windows got curtains.
  - Details: [decisions.md](decisions.md), "The room's quality pass".
- **Chairs:** `min(8, max(4, players))`, set out by the client from the model's eight chairs (a side's lone chair in its middle). The server moves anyone off a chair that goes away.
- **Test fix:** the restart/rejoin test failed once under load (a 150 ms grace period a busy machine could miss). It now has a grace period it can meet.

### Checked

- **Unit tests:** 629 (52 shared, 331 server, 246 client).
- **Cross-browser:** `npm run test:e2e` passes 9/9 in Chromium, Firefox and WebKit.
- **Live runs:**
  - a player dragging the host's mini and die, with the host seeing both land;
  - a YouTube clip playing on the new TV, inside the bezel at any angle;
  - chairs with six browsers: 4 → 5 → 6 → back to 4, and a seated player re-seated.
- **Room size:** `room.glb` 8.96 → 10.42 MB. Its Poly Haven colour maps were swapped for the official JPGs after a conversion through Blender's view transform darkened them.

### Deployed

Pushed (`f202503..0d2ed71`) and deployed at the owner's go-ahead. The container reported healthy on `0d2ed71`, the site serves the new 10.42 MB room and the chair code, and the smoke tests passed 3/3 in Chromium against https://tabletop.murri.me.

---

## 2026-09-25 (very late) — Gadgets inventory, phase 1: the room chest

**Asked** (user): the game's first story is a 1990s German school-trip setting, and wants small period-appropriate gadgets in the room with real functionality (not just decoration) — brainstormed together first (camera+pinboard, flashlight, walkie-talkies, calculator chosen; TV already covers the Walkman/CD-player idea), then asked for a precise implementation plan per item plus a chest as the access point, then "go for it start with the phase 1 then open it locally so i can look at it".

This session is phase 1 only: the chest and the take/drop inventory plumbing every gadget will build on. No gadget has its own effect yet (no camera flash, no flashlight beam, no radio channel, no calculator UI) — this phase only tracks who's holding what.

### What landed

- **Reused the room's existing decorative treasure chest** (Poly Haven asset, `COL_Chest` in the model — see the M10 room-dressing entry) as the gadgets' pickup point instead of building a duplicate prop. `RoomLoader.ts`'s `describeRoom` now also reads `COL_Chest`'s footprint into a `chestSpot`, the same "read gameplay geometry out of the model by name" pattern `Table_Top`/`Fireplace_Fire`/etc. already use.
- **`shared`**: `types.ts` gained `ItemKind`, `InventoryItem`, and `STARTING_INVENTORY` (5 items: a camera, a flashlight, two walkie-talkies, a calculator), plus `GameState.inventory`. New `inventory.ts` (mirroring `sound.ts`'s split from `types.ts`) holds `ItemTakeRequest`/`ItemDropRequest` and their responses. New `item:take`/`item:drop` socket events.
- **`server`**: `SessionStore.takeItem`/`dropItem` — not host-gated (a player can only ever take/drop their own item, same reasoning as the seated toggle); taking an already-held item is refused, taking your own held item is a no-op success. A player who leaves drops whatever they were holding back into the chest (`SessionStore.leave`). `PRESENCE_KEYS` (what a join/leave/reconnect broadcasts) now includes `inventory`, so everyone sees a departed player's item return to the chest live, not just on their next full refresh. An older saved table without `inventory` gets a fresh chest on restore.
- **`client`**: the chest is wired into `RoomView.tsx`'s existing proximity + E interactable system (same as the light switch and the table) — walking up and pressing the interact key opens `InventoryDialog.tsx` (styled like the whiteboard/map-crop dialogs), listing all 5 items with Take/Put-back buttons and who's currently holding what. A small always-on corner HUD (`HeldItems.tsx`) shows the local player's own held items.
- Branch `feat/gadgets-inventory`, off `main`. **Not merged/pushed yet** — the user asked to see it running locally first.

### Checked

- New tests: `SessionStore` unit tests (take/drop happy path, refuse-taking-held, refuse-dropping-not-held, leave-releases-items — 7 tests), a socket-level `inventory.test.ts` (5 tests, mirroring `interactables.test.ts`'s pattern) proving a forged take of an already-held item is rejected with no effect and that a leaving player's item is seen returning to the chest live by whoever remains, and `RoomLoader.test.ts` coverage for the new `chestSpot` extraction (2 tests). `tableArchive.test.ts`'s existing "fills in fields old saves lack" test extended to also cover `inventory`.
- **Environment note**: the first full `npm test` run (before the rebase below) hit 22 failures across several unrelated server test files — `EPERM` on `fs.rmSync` for stale `server/uploads/*` files left from earlier live-testing sessions (gitignored, untracked), cascading into `clients.forEach` errors in `afterEach` hooks whose `beforeEach` never got that far. Confirmed via `git stash` + a clean rerun that this is pre-existing Windows file-lock flakiness (likely antivirus/indexer scanning freshly-touched files), not caused by this branch — a rerun minutes later, with no code changes, passed clean. Not fixed (stale local-only files, out of scope for a code change); flagging here in case it recurs.
- **Rebased onto the follow-up batch** (below), which landed and was pushed while this branch was in progress — see that entry for what it touched. Conflicts were in `sessionStore.ts` (`takeItem`/`dropItem` interleaved with the batch's own new methods after `setSeated` — clip controls, host controls) and `RoomView.tsx` (the chest's `!inventoryOpen` guards folded into the batch's reworked hint card); resolved by keeping both sides' logic, no dropped code either way. Confirmed the room model still carries `COL_Chest` at the same spot after the batch's room rework (eight chairs, more windows) — checked directly against the exported `room.glb`.
- Full `sanity-check` (lint/format/build/test), run after the rebase: 621 tests (47 shared, 336 server, 238 client), all clean.
- **Live browser verification**: pending — next step this session.

### Next session

Four gadgets still to build, each its own branch per the agreed plan (`docs/decisions.md` has the design detail for each): camera + pinboard, flashlight, walkie-talkies (private channel only, per the user's choice), calculator. Each needs its own "use" event once picked up — none of that exists yet, only pickup/put-back. Prop art direction already decided with the user: procedural Three.js geometry for the new gadgets (matching `RoomLamp`/`SoundboardWall`), HUD-icon-only for how a held item displays (no hand-attachment).

---

## 2026-09-25 (late night) — Drawing lag fixed, maps, night sounds

**Asked** (user, after the recommendations): "we only need 2 and 4" (the multi-map switcher, and night sounds), plus "check for lag when someone is drawing on the table. that was one thing I noticed right away."

### What landed

- **Drawing lag:** measured first. While one player drew, both screens fell from 60 to ~7 fps, because every stroke point re-uploaded the whole 2048² table texture. Now only the changed rectangle is uploaded, once a frame, from a CPU-backed canvas. Drawing holds 60 fps on both screens. Details: [decisions.md](decisions.md), "Drawing lag".
- **Maps:** the lost multi-scene thread from Milestone 5, finished:
  - a host map list (show, rename, delete, new);
  - preparing a map without showing it;
  - each map keeps its own drawings;
  - a log line when a map goes on the table;
  - `scene:delete`, a 12-map cap and 40-character names.
- **Night sounds:** synthesized wind, crickets and an owl through the windows, with an eerier wind and a far-off wolf on Halloween. Loudest by a window, faint elsewhere, with its own switch in Settings.
- **Docs:** the overview's non-goals no longer claim there's no persistence.

### Checked

- **Unit tests:** 617 (47 shared, 329 server, 241 client).
- **Cross-browser:** `npm run test:e2e` passes 9/9 in Chromium, Firefox and WebKit.
- **Drawing:** frame times measured before and after, on both players' screens. Strokes checked in all three browsers, including erase-then-draw and on the other player's screen.
- **Maps:** a live two-player run (prepare, rename, grid, show, the other player's table and log, delete).
- **Night sounds:** the audio graph checked in Chromium and Firefox (chirps, owl, wolf, context running).
- **A side finding:** black screenshots of WebKit's top-down view turned out to be a headless-screenshot quirk. The view renders (pixels read back from GL).

### Deployed

Pushed (`a9b6f68..78b73d1`) and deployed at the owner's go-ahead. The container reported healthy on `78b73d1`, the live bundle carries the maps, the night sounds and the drawing fix, and the smoke tests passed 3/3 in Chromium against https://tabletop.murri.me.

---

## 2026-09-25 (night) — The follow-up batch: synced TV, eight players, minis, host controls, Halloween, a world outside

**Asked** (user, one message of follow-ups):
- YouTube pause should be synced.
- The fire sound gets lost.
- More host control.
- A player object to place and move on the table.
- Are the models in the repo?
- Movable dice (drag, click rolls).
- More polished in-game UI.
- Secret dice for the host.
- A soundboard that matches the room.
- More of a Halloween vibe.
- More windows with actual stuff outside and depth.
- What about more than 4 players?
- Check everything inside.

Four choices were asked and answered:
- Halloween as a host toggle;
- eight chairs and eight players;
- anyone controls the TV unless the host locks it;
- minis of your own character.

Everything is in [decisions.md](decisions.md), newest first.

### What landed (one branch each, merged locally)

- **The fire sound:** it faded to 2–7% at the table (quadratic falloff to zero at 8 m). It now keeps a 30% room floor and uses horizontal distance.
- **Synced clips:** the TV's clip is shared state with a server-clock playback anchor. Anyone can pause, play, seek or stop it for everyone, and the host can lock it.
- **Tables of eight:** two new characters (pink, the Witch; teal, the Drifter) and eight chairs, two to a side.
- **Minis:** a miniature of your own character to put on the map and drag around. Dice drag too, and a die pressed but not moved rolls.
- **Secret dice:** the host's dice and rolls that only they see. They're filtered out of everything the server sends anyone else.
- **Host controls:** a Host tab with:
  - lock the table;
  - remove a player (told why, kept out);
  - whether everyone else may draw or use sounds;
  - the TV lock;
  - clearing drawings, the whiteboard, dice or minis, each with a confirm press.
- **The soundboard's look:** a walnut cabinet with an oxblood leather field, brass-bezelled jewel buttons that pulse for everyone when played, engraved nameplates and a picture lamp.
- **The world outside:**
  - four more windows (east and west walls);
  - a whole night landscape seen through every pane with true parallax, via a portal render target;
  - a starry sky, a moon over a glittering lake, a pine forest, a fenced yard, a village whose windows light and dim, a turning windmill, mountains, fireflies and falling leaves.
- **Halloween night** (host toggle):
  - outside: an orange moon, jack-o'-lanterns, a graveyard with ghosts, bats, fog, a black cat, a witch across the moon;
  - inside: pumpkins, a bubbling cauldron, cobwebs, floating candles, paper bats and orange-violet fairy lights.
- **UI polish and the room check:**
  - a keycap hint card, no overlapping prompts, notices at the top, and the map grid row fixed;
  - the two small picture frames hung backwards: turned, and repainted with a realm map and a star chart.
- **Robustness:** the outside falls back to 8-bit where float render targets aren't available.
- **Models in the repo?** Yes. Every model the app loads is tracked, and only the raw ~500 MB character packs are gitignored, with download links (`blender/source-assets/README.md`).

### Checked

- **Unit tests:** 606 (47 shared, 323 server, 236 client). New ones cover clips, minis, secret dice (not even the id reaches another player), host controls and theme, terrain and placement, clip sync maths, throttling and the soundboard palette.
- **Cross-browser:** `npm run test:e2e` passes 9/9 in Chromium, Firefox and WebKit. The outside world was also checked by screenshot in all three.
- **Live Playwright runs** with two and three browsers:
  - clip sync across players;
  - eight seated players;
  - minis and dice dragged and rolled;
  - the secret dice view;
  - every host control (a removed player lands on the join screen with the reason and can't rejoin);
  - clearing drawings repainting every table;
  - Halloween on and off for the other player.
- **Performance:** a steady 60 fps (vsync) at 1600×900 looking out of the windows in both themes.
- **Bugs caught and fixed along the way:**
  - a seek while paused didn't propagate;
  - pressing someone else's mini started a stroke;
  - a cleared map didn't repaint;
  - the brew rendered white;
  - the fog stacked opaque;
  - a firefly bloomed past the glass;
  - the backwards frames.

The room model grew to 8.96 MB (from 8.86).

### Deployed

Pushed (`55c931a..36bc644`) and deployed at the owner's go-ahead. The container reported healthy on `36bc644`, the live bundle carries the new code and the new room model, and the smoke tests passed 3/3 in Chromium against https://tabletop.murri.me.

---

## 2026-09-25 (late night) — Saved tables

**Asked** (user): "lets talk about saving sessions next". It was discussed first, per the "in discussion" rule. I laid out two goals (surviving restarts vs. campaigns between game nights) and three ways back (the same code, named saves, a save file). The owner chose:
- **both** goals;
- **the same code reopens it**;
- **a secret host link** (over browser-only or anyone-with-the-code);
- **7 days**.

Then "yes build it". Full design and reasoning: [decisions.md](decisions.md), "Saved tables".

### What landed

- **Server:**
  - `tableArchive.ts`: a JSON file per table, atomic writes, expiry and caps, the uploads saved tables use, versioned saves.
  - `SessionStore`:
    - player tokens are now kept only as SHA-256;
    - a host key per table;
    - a hook for when a table empties;
    - `snapshot`/`restore` (older saves get defaults);
    - reopening makes the joiner host.
  - `server.ts`:
    - a save loop (fingerprint every 5 s), a save on shutdown and when a table empties;
    - restore at startup, with grace timers for restored players;
    - reopening by host key;
    - the private `session:host-key` whenever the host changes;
    - saved tables in `session:peek`;
    - upload protection.
  - Session codes are capped at 32 characters.
- **Client:**
  - `hostKeys.ts` keeps host keys in localStorage. Host links (`?join=CODE&host=KEY`) are stored and stripped from the URL.
  - Joins send the key, and the app receives keys when you become host.
  - The join screen:
    - "Your saved table · last played … — it reopens just as you left it" with a **Reopen table** button;
    - "waiting for Alice to reopen it" for guests, re-checked every 3 s so Join lights up on its own;
    - a saved table's code can't be taken by a new host.
  - The host's Players tab shows a "Saved automatically" note with **Copy host link**.
- **Deployment:** a `tables` volume (`TABLES_DIR=/data/tables`, owned by uid 10001). The docs now say a deploy mid-game is a short blip, not the end of the table.

### Checked

- 562 unit tests (47 shared, 294 server, 221 client). New ones cover the archive (expiry, caps, atomic writes, unreadable and future-format files, upload references), store hooks and restore, and host-key storage and join-screen states. Socket tests cover:
  - survival across a restart, with an impostor refused by token hash;
  - removing players who don't return;
  - kept, refused and reopened tables, plus reopening after a restart and expiry;
  - the host key reaching only the new host.
- **Live** (a Playwright script against a local production build that kills and restarts the real server process):
  - The table came back after a *hard* kill (only the 5-second saves, no graceful flush), and the page reconnected into it by itself.
  - Leaving kept the table. The host saw Reopen, and a guest was blocked until the host reopened, then got in.
  - The host link on a fresh "device" reopened the table with its chat intact, and the key was stripped from the URL.
  - That run also caught one bug, now fixed: a waiting guest's join screen never refreshed.
### Deployed

- **The first deploy failed at the image build.** Adding `TABLES_DIR` had put a literal `
` into the Dockerfile. The unit and browser tests never build the image, so they couldn't catch it.
  - The deploy aborted before restarting anything, so the old version kept serving.
  - It did expose a second flaw: `REVISION` was written before the build, so it claimed the new commit.
  - Fixed (`628c118`): a correct Dockerfile, and `/srv/apps/tabletop/REVISION` is now written only once the new container is healthy.
- **Deployed `77adb27`.**
  - The container runs as 10001, and `tables/` is owned by it.
  - Checked live over sockets: host, write, leave, the table is kept (`saved: true`), a stranger is refused, reopened intact with the host key.
  - The cross-browser suite passed 9/9 against https://tabletop.murri.me.
  - This was the last deploy that ended games in progress; the old version couldn't save them.
- **Cleanup:** my test runs had left 10 test tables saved on the server. I deleted only those codes and restarted the container (graceful save, then back healthy) so its saved-table list re-read the folder.

- The cross-browser suite passed 9/9. One Firefox run flaked with a browser-protocol error; a rerun of Firefox and a full rerun both passed, and the dev server was confirmed not to restart on save writes. Lint, format and build are clean.

---

## 2026-09-25 (night) — `npm run deploy` works from PowerShell; a broken VPS SSH key line removed

- **`npm run deploy` failed from PowerShell** (`WSL … execvpe(/bin/bash) failed`). The npm script called `bash`, which from PowerShell/cmd is the WSL launcher, not Git's bash. The local side is now Node (`scripts/deploy.mjs`: `git archive` piped into `ssh`, then the remote script over stdin), needing only `git` and `ssh`. The VPS side moved unchanged into `scripts/deploy-remote.sh`; `scripts/deploy.sh` is gone. For a specific commit: `npm run deploy -- <commit>`. Verified by running `npm run deploy` from PowerShell: built, restarted, healthy, running `3eb95e6`.
- **VPS SSH keys**, at the owner's request: `/root/.ssh/authorized_keys` had a third line, an RSA entry labelled `mb` whose key data was truncated. It was never a usable key, and I removed it.
  - A backup is at `authorized_keys.bak-20260925`.
  - A fresh login was verified afterwards.
  - Two keys remain: this PC's ed25519 and an unlabelled RSA key the owner may want to identify.
- **Leftovers check:** none. The VPS holds only `/srv/apps/tabletop`, the one image and the build cache (~355 MB, kept to speed up deploys). Local build output was removed.
- **Note:** a deploy always restarts the container, so it ends every table in progress.

---

## 2026-09-25 (evening) — Deployed to the VPS as one sandboxed container; later ideas parked for discussion

**Asked** (user): "lets do the hosting part first and note down the other stuff for later, but none of them should blindly be done later — its still in discussing phase … deploy the game under tabletop.murri.me … make sure to not destroy any existing stuff on my vps since there is critical stuff running". The one question asked (access) was answered "Open + upload limits".

### What landed

- **Later list parked** (`fb89e4f`). roadmap.md's "Later" is now explicitly *in discussion, not decided*: map presets, wall drawing, saving sessions, dev-tooling upgrades, tokens/minis, fog of war, an initiative tracker, a Safari TV check, mobile. None is to be built without the owner's go-ahead (also saved as a memory for future sessions).
- **Production build and deployment** (`cfacd59`, merged `84ffb03`):
  - The server can serve the built client from the same origin, with proper cache headers. The client uses its own origin in production builds.
  - The server is bundled with esbuild.
  - The Dockerfile has two stages: a build stage, then a runtime stage with production dependencies only and a healthcheck.
  - `deploy/docker-compose.yml` sandboxes the container: memory/CPU/PID limits, a read-only filesystem, all capabilities dropped, capped logs.
  - `scripts/deploy.sh` (`npm run deploy`): `git archive` over SSH, build, wait for healthy.
- **Upload safeguards**, since the site is open (`uploadStorage.ts`):
  - Uploads no live session uses are pruned after 24 h, and there's a 2 GB cap that evicts the oldest unused files first. A file in use, or younger than 10 minutes, is never deleted.
  - Past the cap, uploads get a 507, and each IP gets at most 30 uploads per 10 minutes.
- **The container runs as its own uid** (`8c6eb90`, `0a0e8b4`). The image's uid 1000 is an existing account on the VPS, so the game now runs as 10001, which owns the whole uploads tree.
- **The e2e smoke tests can target any URL** (`E2E_BASE_URL`). They measure the room from a screenshot, so they also run against production builds.
- Docs: new [engineering/deployment.md](engineering/deployment.md), plus a decision entry; tooling, architecture, roadmap, overview, README and CLAUDE.md updated.

### On the VPS (only additive)

- **Inspected read-only first:** Debian 12 with Docker Compose projects under `/srv/apps`, NPM on the shared `murrinet` network, and `/srv/manage.sh` plus a `/srv` git repo. It runs 10 containers, including critical ones.
- **Created:** `/srv/apps/tabletop` (compose project `tabletop`, image `custom-tabletop:latest`, 198 MB). It's on `murrinet` and publishes no host ports. Nothing else was changed: not NPM's config, not `manage.sh`, not the `/srv` repo, not any other container.
- **Verified:**
  - The container is healthy, using ~26 MB of RAM.
  - NPM reaches it: `curl http://tabletop:3001/health` from inside NPM returns ok.
  - It runs as uid 10001 with a read-only root filesystem, and uploads are writable.
  - All 10 other containers are still up.

### Checked

- 531 unit tests (47 shared, 271 server, 213 client), plus the new storage and deployment tests.
- All 9 e2e runs (3 tests × Chromium/Firefox/WebKit) passed against the **local production build** served from one origin, and an upload through it worked.
- Lint, format and build are clean.

### Update: live

The owner created the NPM proxy host. `https://tabletop.murri.me` is live, and all 9 cross-browser smoke runs pass against it. `main` was pushed at the owner's go-ahead. The handover below is kept for the record; what's left from it is a real game night test.

### Next session

- **(Done — see "Update: live".) Waiting on the owner:** create the NPM proxy host for `tabletop.murri.me`. Settings are in [engineering/deployment.md](engineering/deployment.md): forward to `tabletop:3001`, websockets on, Let's Encrypt, Force SSL.
- **Then:**
  - Check that `https://tabletop.murri.me/health` answers.
  - Run `E2E_BASE_URL=https://tabletop.murri.me npx playwright test`.
  - Play a real session with two devices over the internet.
- **Not pushed:** `main` is ahead of `origin/main` (`a596f30`) by the deployment commits, and pushing needs the owner's go-ahead. Deploying doesn't: `npm run deploy` ships local commits over SSH.
- **Deployed revision:** `0a0e8b4` (`cat /srv/apps/tabletop/src/REVISION` on the VPS).

---

## 2026-09-25 (later) — The plan: seated look-around, the cozy room and TV, M10, cross-browser tests, a polish pass

**Asked** (user):
- "do a plan that adressses everytrhing besides 5-8", plus:
  - a TV in the room that plays the YouTube links, matching the room;
  - "when sitting there should absolutly be the ability to view around and see the other players … you should be able to choose";
  - no stray "e" typed into the whiteboard;
  - "make sure that the room feels super cozy and is way more polished and beautiful … go all in".
- Then, going to bed: "finish everything and push after you are done. ALSO do a check on everyhting visually and functionally and go a ahead an polish or change anything you find worthy do adress. it should be maximum quality."
- The movement problem first reported was retracted: it worked after clicking "Click to look around".

Every decision is in [decisions.md](decisions.md), in the 2026-09-25 entries from "Seated: a real chair view" upward.

### What landed (feature branches merged into `main`, then pushed)

- **Seated view** (`4938762`):
  - Sitting looks out from your chair with free mouse-look, so you see the others at the table. V switches to the top-down table view.
  - Chairs are server-kept (`seatIndex`) and stable.
  - The interact key is consumed, so it never types into the dialog it opens (the stray "e").
- **The cozy room and the TV** (`0a9241b`):
  - A fireplace with a flickering fire, sparks and an optional crackle; candles; fairy lights along the beams; a moonlit window; a lounge nook; warm pooled lighting and a vignette.
  - A console TV that plays the shared YouTube clip in the room (a CSS3D layer under a hole in the canvas), with Pop out / On the TV.
  - The room model was re-exported as WebP + meshopt (33 → 9.3 MB).
- **Milestone 10, performance** (`750bc8b`, `5ad6593`):
  - The join screen's bundle went from 992 to 211 KB. The room's code and model preload behind it, with a real progress card.
  - `session:patch` broadcasts only the keys that changed.
  - `npm run load-test` (six players): ~13 KB/s per player, was ~29.
- **Cross-browser smoke tests** (`db1927e`, `4860769`):
  - `npm run test:e2e` runs Playwright in Chromium, Firefox and WebKit (Edge passes on demand) on the real GPU.
  - It covers a host rendering the room, two players seeing each other and chatting, and a dice roll with its sound, all with no page errors.
  - This closed Milestone 9's browser pass.
- **The polish pass**, after scripted screenshot tours of every view, dialog and menu:
  - `ff5d40c`, the room:
    - The misaligned shield over the fireplace is re-seated.
    - The firebox floor is soot, and the ember bed glows like coals.
    - Candle lights no longer burn hotspots into the walls.
  - `eb725d6`, the table: the bare table is seeded, aged parchment with a compass rose, the same for everyone.
  - `63f20ca`, the UI:
    - In-game buttons, fields, pickers, dropdowns and a switch now use the join screen's palette.
    - The session menu collapses.
    - The settings are laid out as rows.
    - The wall-board button you aim at lights up.
    - `THREE.Clock` became `THREE.Timer`.
  - `b63c055`, the TV: a clip resumes where it was when moved between the TV and the card.
  - `e2a2969`, the chandelier: it reads as a brass lantern instead of white patches, and dialogs portaled to `<body>` get the theme.
  - `ce219c0`, audio: a browser without Web Audio stays silent instead of crashing (a WebKit bug found by the new tests).
  - `debb489`, the TV again: its CSS layer runs in millimetres, and where a browser can't place it (Windows WebKit), clips fall back to the corner player automatically.

### Checked

- **515 unit tests** (47 shared, 255 server, 213 client) and **9 e2e runs** (3 tests × 3 engines), plus Edge. Lint, format and build are clean.
- Visual QA, via scripted tours on the real GPU with two players:
  - The join screen at phone, tablet and short-desktop sizes.
  - Every room angle, lights on and off.
  - Seated views, both ways, seeing the other player; dice; drawing; the grid; map upload and crop.
  - Whiteboard write and sync; the wall board (aim, highlight, play, the assign menu); chat, `/roll`, speech bubbles, emotes and walking; the TV in all three engines; every menu tab.
- The wall soundboard's live check, outstanding since 2026-09-24, is done: aim + E plays, an empty button opens the assign menu, and Shift+E reassigns.
- Performance: 60 fps (vsync-bound) at 1080p, 135 draw calls, ~160k triangles.

### Notes for next time

- **Nothing in flight.** The roadmap is complete, and `main` is pushed.
- Ideas are in roadmap.md's "later" list: map presets, wall drawing, persistence.
- **macOS Safari is untested**; only Playwright's Windows WebKit was run. There the TV falls back to the corner player. Real Safari may well show the TV; the self-check decides at runtime.
- **The QA harness** (screenshot tours) isn't committed; the smoke tests are. For a visual pass, script `window.__tabletop` (dev only) from a Playwright test the same way: set `camera.position`, then `camera.lookAt(...)`.
- **Environment gotchas** (on top of the previous entry's):
  - Headless Chromium needs `--use-angle=d3d11` on Windows, or WebGL runs on SwiftShader.
  - Bash heredocs with quotes in them can fail to parse in this tool; write the file with the Write tool instead.

---

## 2026-09-25 — The seven follow-up change requests, plus chat, real dice, pings and a grid

**Asked** (user, relaying a follow-up prompt from the repo's owner):
1. Fix soundboard YouTube links that gave no sound.
2. Make the table square, show the whole map, and add a crop/preview.
3. Six player models tied to six selectable colors.
4. A more detailed room, without the white window object.
5. A whiteboard.
6. A polished login screen.
7. Multiplayer and soundboard sync with 3+ players.

On top: make the Blender MCP work at full potential, keep everything needed in git, let players change their colors, and "make it 10/10 … come up with cool ideas so it doesn't feel limited". Each item's reasoning is in [decisions.md](decisions.md) (2026-09-24 and 2026-09-25 entries).

### What landed (all on local `main`, one merged branch per item)

- **Housekeeping** (`94d1d8c`):
  - `.mcp.json` pins `mcp-for-blender@2.0.4` with telemetry off.
  - The raw Quaternius packs are git-ignored under `blender/source-assets/` (a README there says how to fetch them and rebuild the characters).
  - `*.blend1` is ignored.
- **Identity and presence** (`4174f78`), which had to come first:
  - Sockets are bound to one player, so forged `playerId`s are refused everywhere.
  - A 45 s reconnect grace period, host handover, resume-only rejoin, and `session:replaced` for duplicate tabs.
- **Player colors** (`4fdee15`, CR #3 prerequisite):
  - Six unique colors per session, and a `session:peek` before joining that shows who's there and which colors are taken.
  - Live name/color edits, invite links (`?join=CODE`), and toasts for refused actions.
- **Soundboard links** (`01cc74c`, CR #1): YouTube can't legally be audio-only, so a YouTube link now plays as YouTube's own *visible* player, shown to everyone. Direct audio links are probed before they're accepted, and the board can be managed (move, clear, remove).
- **Room rework** (`8f102a3`, CR #2 and #4):
  - The table is now square.
  - The room is fully furnished from CC0 Poly Haven assets via the Blender MCP.
  - The white window-like object is gone.
  - Colliders, seats, the table and the whiteboard are read from named objects in the model.
  - The table surface shows true map colors.
- **Map crop dialog** (`11994f5`, CR #2): pan/zoom/presets on a square preview that keeps the aspect ratio, baked into the uploaded image. Uploads are named by their validated type.
- **Characters** (`69b30e1`, CR #3):
  - Six distinct Quaternius characters, one per color, with the shirt in the player color, built by `scripts/build-characters.mjs`.
  - Smooth movement; walk/run animation from measured speed (Shift runs).
  - Seated players sit on real chairs.
  - Emotes on keys 1–6, and name tags.
- **Whiteboard** (`125b28b`, CR #5):
  - Six synced lines, each in its writer's color (darkened when needed so it stays legible).
  - Aim + E opens the editor.
  - Edits are sent per line, so two writers never overwrite each other.
- **Join screen** (`5bda583`, CR #6): a live 3D preview of your character (it waves, and you can drag to spin it), a branded card, a paste-an-invite-link code field, a "who's at the table" line with colored dots, a rejoin card, and a d20 favicon.
- **Real RPG dice** (`1cf9724`, extra):
  - d4–d20 with numbered faces, in the owner's color. They tumble and land with the server's result on top, in the same pose on every client, with a result badge (gold nat 20, red nat 1) and a synthesized clatter.
  - A `rollCount` nonce fixes same-number re-rolls not animating.
  - Pool rolls; rolling by aim + E, by clicking at the table, or from the new Dice tab.
- **Chat and session log** (`3e3d2ff`, extra):
  - The log carries chat, every roll (with breakdown and total) and joins/leaves.
  - `/roll 2d6+3` rolls on the server.
  - Speech bubbles appear over the speaker.
  - Enter opens chat; sending hands the mouse back to mouse-look.
  - Players now spawn on per-color spots facing the table, and a reload keeps your position.
- **Pings and grid** (`af32197`, extra):
  - Right-click the table (seated or walking) for a colored ping everyone sees and hears.
  - The host can lay a 10–30 cell grid over the map.
- **Four-player sync test** (`e9906d7`, CR #7): one end-to-end socket test plays a busy four-player session (soundboard link, play and concurrent reassignment; dice pool; simultaneous whiteboard writes; chat and `/roll`; a leave). All remaining clients end with deep-equal state and everyone hears the sound exactly once. It passed 10 of 10 runs.

### Checked

- Full sanity pass on every merge. Now: **491 tests** (47 shared, 246 server, 198 client). Lint, format and build are clean.
- Live in Chrome with 2–4 players (tabs plus a scripted socket client), per feature. Notable results:
  - The wall soundboard, deferred from last session, is now verified: the board renders, aim + E plays, and one press played Bell exactly once in each of three tabs.
  - Every dice kind landed showing its rolled number.
  - Whiteboard, chat and ping sync across tabs.
- **Bugs caught live and fixed** (details in decisions.md):
  - Whiteboard: upside-down text (glTF `flipY`), a lost-update race, illegible yellow ink.
  - Dice: pale, blown-out color under the chandelier.
  - Join screen: a 377 px card in a 343 px column.
  - Chat feed: showing history as news (a `performance.now()` sentinel).
  - Layout: everyone spawning inside each other; the prompt and hint overlapping.

### Next session

- **Not pushed** at the time (pushed later that day, at the user's go-ahead).
- **Remaining:**
  - Milestone 10 (performance & polish). The JS bundle is ~930 KB (three.js dominates), so code-split the room/three.js away from the join screen. Also load-test drawing and dice with many players.
  - Milestone 9's cross-browser pass (Edge/Firefox), which this environment can't drive.
  - The roadmap's "later" list (wall drawing, persistence).
- **Environment gotchas:**
  - With the in-app browser pane hidden, `requestAnimationFrame` doesn't run. Live checks used a tab whose rAF was swapped for a timer *before joining* (RoomView mounts on join).
  - Writing a file with a Bash heredoc can leave Vite serving a half-written transform. `touch` the file, then reload.
  - Any edit under `server/src` (tests included) restarts the dev server and drops every in-memory session.
- **Branch:** `main`, clean. No feature branch open.

---

## 2026-09-24 — Wall soundboard rework: 4x4 grid, per-button sound assignment, aim + E

**Asked** (user): "the soundboard isnt working as intended. it shoul be on one of the walls. a big board with 16 buttons (4x4) interacting with one of the buttons with e should play the attatched sound for all players. if theres no sound attatched e should open a menu where you can select a sound by posting an url or uploading a file."

### What landed

- Replaced the M8 floor-standing "jukebox cabinet" console with **`SoundboardWall`** (`client/src/three/SoundboardWall.ts`): a flat panel mounted on the room's east wall (the same corner the old cabinet occupied), 16 fixed buttons in a 4x4 grid.
- New **`GameState.soundboardSlots`** (16-entry, slot index -> sound id or `null`) — independent of the ever-growing `soundboard` list; a fresh session pre-fills slots 0/1/2 with the built-in presets.
- **Aim-based targeting, not proximity**: `SoundboardWall.raycastFromCamera` casts from the camera's look direction (bounded range) since 16 wall-mounted buttons can't be told apart by XZ distance alone. Added a small on-screen crosshair while locked so there's a visible aim point.
- Pressing E on a filled button plays its sound (now for **any player**, not just the host — see below); on an empty button it opens a new overlay (**`SoundboardAssignMenu.tsx`**) to attach a sound via a direct link or file upload, reusing the same upload/link logic as the 2D panel.
- **`sound:play` is no longer host-gated** — relaxed globally (both the wall board and the 2D panel's Play buttons), confirmed with the user via `AskUserQuestion` first, since gating the same event differently by which UI triggered it made no sense.
- `sound:upload` gained an optional `slotIndex` field so pressing an empty button can register + place a sound in one round trip, instead of a second event.
- Branch `feat/wall-soundboard`, squash-merged into local `main`. **Not pushed.**

### Checked

- Full `sanity-check` (lint/format/build/test): 232 tests (155 server, 77 client — up from 227), all clean. New `soundboardLayout.test.ts` unit-tests the pure grid-offset math; `soundAndMute.test.ts` extended for the relaxed play authority and slot-assignment behavior (valid + out-of-range `slotIndex`).
- **Live browser verification was not completed** — the Claude-in-Chrome extension reported disconnected when attempted this session. Build/type-check/tests all pass, but the actual in-room look/feel (wall placement, button spacing, crosshair, the assign-menu overlay) has not been visually confirmed. Flagged to the user directly rather than claimed as done.

### Next session

If picking this back up: reconnect the Claude-in-Chrome extension and do the deferred live check — join a session, walk up to the east wall, confirm the 4x4 board renders in a sensible spot (not clipping into the wall or overlapping other geometry), aim at a button and confirm the crosshair/prompt/E-to-play work, press an empty button and confirm the assign-menu overlay opens and correctly un-locks the pointer, submit a sound via both the link and upload paths and confirm it appears on the right button and plays for a second (non-host) player too.

- **Branch:** `main` — none open. `feat/wall-soundboard` merged and deleted.
- **State:** M1–M9 done, plus the file-uploads, session-menu/settings, and wall-soundboard extensions.
- **Watch for:** the deferred browser check above; also double check the wall panel's exact placement/scale against the real Blender room the first time it's actually viewed, since its position (`SOUNDBOARD_WALL_POSITION`) was chosen from prior screenshots/known-clear space, not verified against the live geometry this round.
- **Environment:** dev server was left running in the background this session (started fresh partway through after the prior session's instances had died) — verify it's still healthy before relying on it, or just restart with `npm run dev`.

---

## 2026-09-24 — Session menu rework: tabs, client settings, rebindable interact key, direct-link sounds

**Asked** (user): restructure the top-right session menu into categorized tabs (only one open at a time, centered text, consistent spacing, icons); add client-only settings (volume, extensible for more later); make the interact key rebindable; investigate the soundboard "not working" and add a way for any player to add sounds via a link (their example: a YouTube link).

### What landed

- **`SessionView.tsx`** rewritten around a `role="tablist"` of 5 tabs (Players/Map/Dice/Sound/Settings, each with a hand-drawn inline SVG icon from new `client/src/icons.tsx` — no icon library added, no emoji), rendering exactly one tab panel at a time. CSS reworked to center text and apply consistent spacing throughout the panel (`client/src/style.css`).
- **New `client/src/settings.ts` + `SettingsContext.tsx`/`settingsContextValue.ts`/`useSettings.ts`** (split three ways to satisfy `eslint-plugin-react-refresh`'s `only-export-components` rule): client-only `localStorage`-backed `{ masterVolume, interactKey }`, following `playerIdentity.ts`'s existing dependency-injected-storage pattern so it stays unit-testable without jsdom. Wired into `main.tsx` via a `SettingsProvider`.
- **Volume**: a `SettingsTab` slider drives a new `setMasterVolume()` in `sounds.ts`, applied via `GainNode.gain` peak scaling for the built-in synthesized tones and `HTMLAudioElement.volume` for uploaded/linked sounds.
- **Rebindable interact key**: stored as a raw `KeyboardEvent.code` (matching the WASD convention), displayed via new `client/src/keyLabel.ts`'s `formatKeyCode`. The rebind UI refuses movement keys (`FirstPersonController.ts` now exports `MOVEMENT_KEYS`) with an inline error and stays open; `Escape` cancels. `RoomView.tsx`'s interact-key check and on-screen prompt now read the live setting instead of a hardcoded `'KeyE'`.
- **Soundboard investigated, not a bug**: tested the built-in sounds live, found no error; the user confirmed afterward it "feels unfinished" rather than broken — addressed by the asks below, not a fix.
- **Direct-link sounds**: any player can now add a sound to the shared soundboard via a pasted direct audio-file URL (not just file upload), alongside the existing upload flow. New `client/src/soundName.ts`'s `deriveNameFromUrl` names it from the URL automatically. **Explicitly declined** to build any YouTube audio extraction/download mechanism (ToS/copyright) — explained to the user directly, who chose this direct-link approach instead.
- Branch `feat/session-menu-settings`, squash-merged into local `main`. **Not pushed.**

### Checked

- Full `sanity-check` (lint/format/build/test): 227 tests (154 server, 73 client — up from 154/58), all clean.
- Live single-tab Chrome browser check (this environment's only automation target): joined a session; clicked through all 5 tabs confirming only one shows at a time with centered/icon'd layout; dragged the volume slider; exercised the rebind flow end-to-end (movement-key rejection, `Escape` cancel, successful rebind to `F` and back to `E`); added a sound via a direct `.mp3` URL, confirmed it appeared correctly named and played with no console errors.

### Next session

No handover in flight — this work is fully committed and merged. Only Milestone 10 (performance & polish) remains on the original roadmap; see the M9 entry below for its paste-to-start prompt (still accurate). `main` has not been pushed to `origin` — ask before doing so.

- **Branch:** `main` — none open. `feat/session-menu-settings` merged and deleted.
- **State:** M1–M9 done, plus the file-uploads extension and this session-menu/settings extension.
- **Watch for:** same as the M9 entry below (cross-browser gap, Chrome-only automation tooling) — this session's browser verification was Chrome-only for the same reason.
- **Environment:** dev server processes from this session were left running in the background; stop and restart fresh next session rather than assuming they're still healthy.

---

## 2026-09-24 (Milestone 9) — Host authority hardening: an audit pass, two real coverage gaps closed

**Asked** (user): "continue" — picked up the M8 session's handover, starting Milestone 9.

### What landed

- **No new feature** — this milestone audited existing host-gating coverage rather than adding any. Re-read `roadmap.md`'s M9 description against the actual code and found it stale: it named `dice:spawn/remove`, player positions, and join/leave as host-gated, but those were deliberately settled as **open to any player** back in Milestone 4/6 — the original spec's "needs server-side validation" list was never the same thing as "needs a host check." The real host-gated set: `scene:create`, `scene:change`, `scene:update`, `sound:play`, `player:mute`/`player:unmute` of another player.
- **`server/src/hostAuthority.test.ts`** (new) — closes the two real gaps the audit found: `scene:create` and `scene:change` had never been proven at the socket level (only `scene:update` and `sound:play`/`player:mute` had a live "forged non-host request is rejected" test; `scene:create` only had a `SessionStore`-level unit test, and `scene:change` had no rejection test at any level). Also added `player:unmute`'s first test coverage at all (it shares `setMuted`'s host-gating logic with `player:mute`, which was already well-tested, but the event itself never had its own test), and a socket-level malformed-`drawing:start` test (every other event family already had one; `drawing:*` only had unit-level coverage).
- `docs/roadmap.md`'s M9 entry corrected to name the actual host-gated actions instead of the stale spec-derived list.
- Branch `feat/host-authority-hardening`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M9 exit-check test** (`server/src/hostAuthority.test.ts`, 4 tests): a non-host's forged `scene:create`/`scene:change` are each rejected while the host's own succeed; a non-host cannot unmute another player while the host can; a malformed `drawing:start` doesn't crash the server. Break-round done on both new host-gate checks together (disabled, confirmed both tests correctly fail, restored).
- Full `sanity-check` (lint/format/build/test, 212 tests across all 3 workspaces — up from 208) clean.
- **The roadmap's other M9 ask — a cross-browser pass (Chrome, Edge, Firefox) — could not be performed**: this environment's browser automation tooling drives Chrome only. Logged as an accepted, unverified gap in `docs/decisions.md` rather than silently skipped, with a grep-based sanity check (no vendor-prefixed or Chrome-specific APIs anywhere in `client/src`) offered as partial, non-substitute reassurance.
- Dev server processes: none were started this session — all work was server-side test coverage, no browser verification needed or performed.

### Next session

Milestone 9 is done. Only Milestone 10 (performance & polish) remains from the original roadmap. Paste-to-start prompt:

> Start Milestone 10: performance & polish. Confirm delta-only updates (player:move, drawing:*) actually hold under real load — no accidental full-state re-broadcast creeping in. Basic error/disconnect UX (what a player sees if the server drops, or if their session no longer exists). Session cleanup on empty session (already implemented since Milestone 2 — verify it still holds). Otherwise, this is the milestone for whatever playtesting the earlier ones surfaces, so a real playtest pass (as a user, not just automated checks) is probably the most valuable first step.

- **Branch:** `main` — none open. `feat/host-authority-hardening` merged and deleted.
- **State:** M1–M9 all done, plus the file-uploads extension. Every host-gated action now has live socket-level proof of rejection, not just unit-level or incidental coverage.
- **Do next:** Milestone 10 per [docs/roadmap.md](roadmap.md) — the last milestone on the original roadmap. After that, revisit `docs/roadmap.md`'s "Later, out of scope for now" section with the user (map presets, wall drawing/pen tool, a fuller interactive map-fit tool) if there's appetite to keep building past the original ten milestones.
- **Watch for:** the cross-browser gap from this session (Edge/Firefox never actually driven, Chrome-only tooling) — if M10's polish pass turns up a real cross-browser concern, or if different tooling becomes available, that's the natural place to close it. Everything else from prior sessions' "watch for" notes (Chrome Pointer Lock automation restriction, the PATH-after-install gotcha, automated-click coordinate precision) still applies if browser verification resumes in M10.
- **Environment:** nothing running — no dev server was started this session.

---

## 2026-09-24 (Milestone 8) — Room interactables: sit down at a full-screen table with a drawing toolbar, flip the light switch, play sounds from a physical console

**Asked** (user): "continue" — picked up the file-uploads session's handover, starting Milestone 8. Two design questions asked and answered before implementation (`AskUserQuestion`): what the interactable(s) should be, and how a player triggers one. The user specified something bigger than the roadmap's one-line placeholder: the table switching between "wander the room" and "sit at the table" modes, a toggleable light, and — explicitly offered as optional, "cook something cool and funny up for this" — a physical soundboard console with large clickable buttons. All three landed. Trigger method: proximity + a keypress (E). A follow-up ask mid-session, after seeing the seated view working, added two refinements: the seated table view should be full-screen (square, not widescreen-cropped), and it needs a small drawing toolbar (pen color/size, an eraser) since that's the natural place to draw precisely. Also flagged: a light-toggle concern, re-verified live and confirmed already working correctly.

### What landed

- **`shared`**: `interactables.ts` (`ObjectInteractRequest`/`Response`) and `SocketEvent.ObjectInteract` — one generic event for every interactable, dispatched server-side by a string `objectId`, per `docs/engineering/architecture.md`'s own suggested naming. `Player` gained `seated: boolean`, `GameState` gained `lightOn: boolean`. `Drawing` gained `color`/`width` (chosen once per stroke, carried on `DrawingStartRequest`, validated server-side with a width bound).
- **`server`**: `SessionStore.toggleLight`/`toggleSeated` — neither host-gated (light affects everyone equally; a player can only ever toggle their *own* seated status); a single `object:interact` handler in `server.ts` dispatching on `objectId`, ack + full-state broadcast like `scene:*`/`dice:*`. `startDrawing` now stores each stroke's chosen color/width.
- **`client`**: `interaction.ts` (`nearestInteractable`, pure proximity math, unit-tested); `RoomLamp.ts` (a walk-up-to-able lamp prop whose bulb material brightens/dims with `GameState.lightOn`) and `RoomLighting.ts` extended with `setRoomLightsOn` (the room's ambient/point lights dim to near-dark, never fully black, when the light is off); `FirstPersonController` gained `sit()`/`stand()` — a pure camera takeover (position/orientation swap + releasing pointer lock, which for free disables WASD via the controller's existing `!isLocked` early-exit and immediately re-enables the already-existing raycast-driven table interactions); `PlayerAvatars` squashes a seated player's capsule to ~55% height, the visible-to-everyone signal for "seated"; `SoundboardConsole.ts` — a physical, clickable "jukebox" prop reusing `sound:play` entirely (presentation only, zero new server logic), buttons sized generously (`BUTTON_RADIUS = 0.16`) after live testing showed small buttons are a genuinely hard click target at in-room viewing distance. Sitting also now switches the viewport to a square frame (`RoomView.tsx`'s `applyViewportSize`) so the round table fills the screen properly, with `SEATED_HEIGHT_ABOVE_TABLE` retuned to match; a small `.drawing-toolbar` (pen color/size, an eraser) appears only while seated, driving `TableCanvas`'s now-per-stroke color/width and a new `eraser.ts`'s `findStrokeNear` hit-test that reuses the previously-unwired `drawing:delete` event. `RoomView.tsx` wires all of it together: an E-press proximity prompt (a new `.interaction-prompt` pill, `style.css`), gates `player:move` sends off entirely while seated (otherwise the camera's teleport to/from the top-down view would itself broadcast as a huge, wrong position jump), and reconciles a rejoin/reload against an already-seated `GameState.players` snapshot so a lingering seated flag (a disconnect doesn't clear it) doesn't desync the local camera from server state.
- Branch `feat/room-interactables`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M8 exit-check test** (`server/src/interactables.test.ts`, 4 tests): a fresh session starts with the light on and nobody seated; a light toggle by any player is seen live by another and can be toggled back; a player sitting only ever changes their *own* status, seen live by everyone, and can stand back up; an unrecognized `objectId`/malformed payload is rejected without crashing. Break-round verified on the broadcast.
- `client/src/three/interaction.test.ts` (5 tests) and `client/src/three/eraser.test.ts` (6 tests) cover the proximity and stroke-hit-test math in isolation. `client/src/three/PlayerAvatars.test.ts` extended (now 8 tests) — a seated avatar squashes, and `updateOne` is confirmed to always apply as standing (documenting why `RoomView.tsx` must never send `player:move` for a seated local player). Server-side drawing tests extended for the new `color`/`width` fields.
- Full `sanity-check` (lint/format/build/test, 208 tests across all 3 workspaces) clean, both mid-session and right before merge.
- **Real two-tab browser verification, working around the known Chrome pointer-lock automation restriction** (logged since Milestone 3) by directly driving the exposed camera object and dispatching real `KeyE`/click input: the light toggle visibly dimmed the room and the lamp prop, synced live on both tabs, and toggled back on correctly too; sitting switched to a correct top-down, table-filling square view and hid the normal movement prompt, with the seated player's avatar visibly squashed on the other tab; standing restored the original view exactly; the soundboard console's buttons correctly triggered `sound:play` for the host and were rejected server-side for a non-host (matching the 2D panel); the drawing toolbar's pen color and eraser were verified against the table's raw canvas pixel data (not just the lit 3D render, which desaturates colors — a known characteristic, not a bug), and erasing a stroke on one tab correctly removed it on the other tab's view too.
- **Caught and fixed three real bugs live**, not via code review: (1) the E-press prompt text failed to update between "sit at the table" and "stand up" because the change-detection check only compared the nearest interactable id (which stays `'table'` in both states) and missed that the `seated` flag it also depends on had changed; (2) `drawing:delete` (implemented since Milestone 5, never wired to any UI until the eraser) redrew a remote viewer's table from a stale local copy of the scene that still had the deleted stroke in it, since the event has no accompanying `session:state` to refresh that copy first; (3) reported by the user directly after a first testing pass ("could erase once but after that... broken") — the real cause was that *neither* local nor remote drawing handlers ever updated the local copy of the scene's drawings in real time as strokes were drawn, so the eraser usually couldn't find anything drawn in the current sitting at all, only strokes that predated it. Fixed and reverified: drew and immediately erased three fresh strokes in a row (all first-attempt hits), then repeated across two tabs (one drawing, the other erasing immediately). Full detail on all three, plus a React-controlled-input automation-testing gotcha hit along the way, in `docs/decisions.md`.
- Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

Milestone 8 is done — **M1–M8 all complete**, plus the file-uploads extension. M9 (host authority hardening) and M10 (performance & polish) are the two roadmap milestones left. Paste-to-start prompt:

> Start Milestone 9: host authority hardening. Server-side validation already exists for every host-gated action (added incrementally as each milestone landed) — this milestone is a dedicated audit/hardening pass, not new features: manually forge a client event for each host-only action (scene create/change/update, sound:play, player mute, and anything else host-gated) and confirm the server rejects it with no effect, plus a real cross-browser pass (Chrome, Edge, Firefox required; Safari best-effort). Exit check: a manually-forged client event for a host-only action is rejected by the server and has no effect.

- **Branch:** `main` — none open. `feat/room-interactables` merged and deleted.
- **State:** M1–M8 all done, plus the file-uploads extension. The room now has a light switch, a sit-down table mode (full-screen square view, a pen/eraser drawing toolbar), and a physical soundboard console on top of everything from M1–M7.
- **Do next:** Milestone 9 per [docs/roadmap.md](roadmap.md), then Milestone 10. Both are audit/polish passes over what already exists rather than new features, so they're lighter than a typical milestone — could reasonably be combined into one session.
- **Watch for:** Chrome's Pointer Lock automation restriction can be worked around for keyboard-triggered (not click-to-lock-requiring) interactions by directly driving `camera.position` through a temporary debug hook and dispatching a real `computer` `key` action — documented in this session's approach, useful if another movement-dependent feature needs live verification. The PATH-after-install gotcha (`docs/engineering/tooling.md`) for `npm`/`node` in fresh Bash/PowerShell tool shells on this machine. Automated browser clicks need real page coordinates, not the (possibly downscaled) screenshot's own pixel dimensions — the `computer` tool documents this but it's easy to eyeball wrong; when precision matters, verify against `element.getBoundingClientRect()`/a `Vector3.project(camera)` computation rather than a screenshot ruler.
- **Environment:** nothing running — no dev server. Both ports confirmed clear at session end.

---

## 2026-09-24 (M5/M7 extension) — File uploads: players upload sounds to the shared soundboard, the host uploads a map image

**Asked** (user): "continue with m8. i want to be able for the players to upload sounds for a shared soundboard and i want the map/background of the tabe to be changeable by file upload or link" — plus a mid-turn follow-up describing four related future ideas (standard map presets, wall drawing + a pen tool, a full-screen "sit down" tabletop mode, and interactive map resize/fit), asking them captured in the roadmap if not already there.

### What landed

- **`server`**: `uploads.ts` — REST routes (`POST /uploads/images`, `POST /uploads/sounds`) via `multer` disk storage under `server/uploads/{images,sounds}/` (gitignored), with mimetype allowlists and size caps (10MB/8MB), served back via `express.static`. `SessionStore.hasSound`/`addSound`; a new `sound:upload` socket handler (open to any player, not host-gated) that registers an uploaded file's URL into `GameState.soundboard`; `sound:play` now rejects an unrecognized `soundId`.
- **`shared`**: `SoundState` gained a `url` field (`''` = built-in synthesized preset, set = uploaded file URL) and a new `BUILTIN_SOUND_PRESETS` constant the server seeds every session's soundboard with; `sound.ts` gained `SoundUploadRequest`/`Response`.
- **`client`**: `uploads.ts` (`uploadImage`/`uploadSound`, `fetch` + `FormData` against the new REST routes); `sounds.ts` rewritten around a `playSound(entry: SoundState)` API that plays a built-in tone or an uploaded file depending on `entry.url`; `SessionView.tsx` gained a map-image file input alongside the existing URL field, and the soundboard section now renders from live `GameState.soundboard` (not a static catalog) with an always-visible upload input; `App.tsx`'s `SoundPlay` listener now looks up the played sound from live state (via a `gameStateRef`) instead of a hardcoded preset id, and a new `handleUploadSound` wires the upload-then-register flow. `TableCanvas.ts` + new `imageFit.ts` (`computeCoverRect`) replaced straight image-stretch with an aspect-preserving "cover" crop, as a partial answer to the mid-turn map-fit ask.
- `docs/roadmap.md`'s "Later, out of scope for now" section expanded with the three other mid-turn asks (map presets, wall drawing/pen tool, tabletop "sit down" mode), each with the date and reasoning for deferring.
- Branch `feat/file-uploads`, squash-merged into local `main`. **Not pushed.**

### Checked

- `server/src/uploads.test.ts` (5 tests, real `fetch`/`FormData`/`Blob`): valid image/sound upload+serve, rejected mimetype (both kinds), oversized file rejected.
- `server/src/soundAndMute.test.ts` extended to 9 tests: a fresh session has the built-in presets; a non-host's uploaded sound is added to the shared soundboard, seen live by everyone, and playable by the host afterward; `sound:play` rejects an unknown id; `sound:upload` rejects a duplicate id. Break-round done on the new `sound:upload` broadcast.
- `client/src/three/imageFit.test.ts` (4 tests) covers the cover-fit crop math in isolation.
- Full `sanity-check` (lint/format/build/test, 189 tests across all 3 workspaces) clean, both mid-session and right before merge.
- **Real two-tab browser verification**: a non-host player uploaded a sound file — it appeared live in both tabs' soundboard list, Play button visible only on the host's tab; the host played both the upload and a built-in preset with no console errors on either tab; the host uploaded a map image — the table's texture visibly changed in sync on both tabs (POST and the subsequent image GET both 200), including for the second tab rejoining fresh afterward (its initial state already carried the uploaded background). No console errors anywhere in the flow.
- Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

This extension is done; Milestone 8 itself (room interactables) is still owed from the original "continue with m8" ask. Paste-to-start prompt:

> Start Milestone 8: room interactables. Additional 3D objects in the room beyond the table/dice that a player can approach and use (dice tray, shelf, etc.) — the first real use of the "future 3D tabletop objects" bucket from the original spec. New event(s) (e.g. `object:interact`), server-validated same as everything else. Exit check: a player walks up to an interactable and triggers it; the effect is visible to everyone in the session.

- **Branch:** `main` — none open. `feat/file-uploads` merged and deleted.
- **State:** M1–M7 all done, plus this file-uploads extension on top of M5/M7. The soundboard and map background are now backed by real uploads, not just built-ins/links.
- **Do next:** Milestone 8 per [docs/roadmap.md](roadmap.md) — likely needs a proximity/interaction-range check (how close counts as "approaching" an interactable), a design call worth flagging to the user rather than assuming.
- **Watch for:** four related-but-bigger asks are now logged in `docs/roadmap.md`'s "Later" section (map presets, wall drawing/pen tool, tabletop "sit down" mode, full interactive map resize/fit) — don't assume any of them are in scope for M8 just because they were mentioned in the same conversation. The Chrome Pointer Lock automation restriction (M3+) and the Blender MCP concurrent-session gotcha (M3 part 2) if either comes up again. The PATH-after-install gotcha (`docs/engineering/tooling.md`) for `npm`/`node` in fresh Bash/PowerShell tool shells on this machine.
- **Environment:** the client dev server (started this session for browser verification) should be stopped before ending — confirm ports 3001/5173 are clear.

---

## 2026-09-24 (Milestone 7) — Soundboard & mute: the host plays a sound everyone hears, a player's mute status is visible to the group

**Asked** (user): "next milestones" — after Milestone 6 finished (dice), picked up Milestone 7 per `docs/roadmap.md`.

### What landed

- **`shared`**: `sound.ts` (`SoundPlayRequest`/`Response`, `PlayerMuteRequest`/`Response`, `PlayerUnmuteRequest`/`Response`) — `Player.muted` and `GameState.soundboard` were already in the shared types since Milestone 1's placeholders, unused until now.
- **`server`**: `SessionStore.isHost` (a small reusable host check) and `SessionStore.setMuted` (self-service mute always allowed, host can additionally mute/unmute anyone); `sound:play`/`player:mute`/`player:unmute` socket handlers in `server.ts`. `sound:play` is host-only and broadcasts to the whole room *including the sender* (`io.to`, not `socket.to`) since there's no local-prediction reason to exclude them the way `player:move`/`drawing:*` do.
- **`client`**: `sounds.ts` — a small fixed soundboard catalog (Bell/Drum/Alert) synthesized with the Web Audio API (`OscillatorNode`) rather than shipped as audio files, since no real sound assets exist in this project; a single lazily-created, reused `AudioContext` handles the browser autoplay policy. `SessionView.tsx` gained a host-only Soundboard panel, a Mute/Unmute button per player (shown for yourself always, for others only if you're the host), and a "(muted)" tag in the player list.
- Branch `feat/soundboard-mute`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M7 exit-check test** (`server/src/soundAndMute.test.ts`, 5 tests): a host-played sound is received by every client including the host itself; a non-host is rejected; a self-mute and a host-initiated mute of another player are each seen live by everyone; a non-host is rejected from muting someone else while the host succeeds; malformed payloads don't crash the server. Break-round verified on both the sound and mute broadcasts separately.
- **Caught and fixed a real test-timing bug while writing the mute break-round** (not a server bug): a `.once()` session:state listener registered right after two `session:join` calls could catch an already-in-flight "player joined" broadcast instead of the later mute broadcast. Fixed with a short drain delay before registering the listener — logged in `docs/decisions.md` as a pattern to reuse if it recurs.
- `client/src/sounds.test.ts` covers the catalog shape and the unknown-id no-op path; actual tone playback (real `AudioContext`, unavailable under Vitest's `node` environment) is covered by the browser check below instead.
- Full `sanity-check` (lint/format/build/test, 180 tests across all 3 workspaces) clean, both mid-session and right before merge.
- **Real two-tab browser verification**: a non-host player's UI correctly hides the Soundboard/Map panels (host-only) while still showing a self-Mute button and the Dice panel; the host playing a sound produced no console errors on either tab; a self-mute and a host-initiated unmute of another player each appeared live on both tabs with no refresh.
- Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

Milestone 7 is done. Paste-to-start prompt:

> Start Milestone 8: room interactables. Additional 3D objects in the room beyond the table/dice that a player can approach and use (dice tray, shelf, etc.) — the first real use of the "future 3D tabletop objects" bucket from the original spec. New event(s) (e.g. `object:interact`), server-validated same as everything else. Exit check: a player walks up to an interactable and triggers it; the effect is visible to everyone in the session.

- **Branch:** `main` — none open. `feat/soundboard-mute` merged and deleted.
- **State:** M1–M7 all done. The room now has a full tabletop toolset (map, drawing, dice, soundboard, mute status) on top of the walkable 3D room and player avatars from earlier milestones.
- **Do next:** Milestone 8 per [docs/roadmap.md](roadmap.md) — likely needs a proximity/interaction-range check (how close counts as "approaching" an interactable), a design call worth flagging to the user rather than assuming.
- **Watch for:** the Chrome Pointer Lock automation restriction (M3+) and the Blender MCP concurrent-session gotcha (M3 part 2) if either comes up again. The PATH-after-install gotcha (`docs/engineering/tooling.md`) for `npm`/`node` in fresh Bash/PowerShell tool shells on this machine. The `.once()`-can-catch-a-stale-broadcast test-timing gotcha (this session, `docs/decisions.md`) if a new integration test needs to wait for a *specific* session:state broadcast following other recent ones.
- **Environment:** nothing running — no dev server. Both ports confirmed clear at session end.

---

## 2026-09-24 (Milestone 6) — Dice: any player spawns and rolls a die, the result is visible to everyone live

**Asked** (user): "next milestone" — after Milestone 5 finished (tabletop map & drawing), picked up Milestone 6 per `docs/roadmap.md`.

### What landed

- **`shared`**: `Dice` gained `position: Vector3` (the original spec never had one) and lost `sceneId` — a die is a physical object on the table itself, not part of the 2D map layer, so swapping the map shouldn't affect it (logged in `docs/decisions.md`). `dice.ts` (`DiceSpawnRequest`/`DiceRollRequest`/`DiceRemoveRequest`, ack'd + full-state-broadcast like `scene:*`).
- **`server`**: `SessionStore.spawnDice/rollDice/removeDice` — none host-gated (any player), the roll result decided by `Math.random()` server-side and never trusted from the client. Matching validators and `dice:*` socket handlers in `server.ts`. Renamed `SceneMutationResult` to the more accurate `GameStateMutationResult` since dice mutations now share the same ack+broadcast result shape.
- **`client`**: `DiceManager.ts` (a spinning-cube + camera-facing number-label sprite per die, membership and roll-detection both driven by one `sync()` since dice changes — unlike `player:move`/`drawing:*` — arrive via the same full-`GameState` channel as scenes); `diceSync.ts` (pure add/remove/rolled diffing, extracted for testability the same way `tableCoordinates.ts` was in Milestone 5); `diceSpawn.ts` (picks a random resting spot within the table's radius, client-side, sent as part of the spawn request — mirrors `player:move`'s trust boundary, since the server has no room-geometry knowledge by design). `SessionView.tsx` gained a "Dice" section (spawn button + a Roll/Remove per die), available to every player, not just the host. `RoomView.tsx` wires `DiceManager` into the room-load/animate-loop/cleanup lifecycle alongside `PlayerAvatars`/`TableCanvas`.
- Branch `feat/dice`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M6 exit-check test** (`server/src/dice.test.ts`, 4 tests): a spawn and a roll are each seen live by another player; a die spawned by one player can be rolled/removed by a *different* player (confirms it's genuinely not owner/host-gated); a later joiner's initial state includes an already-rolled die; malformed payloads are rejected without crashing. Break-round verified: disabled the spawn broadcast, watched the "seen live" assertion time out and fail, restored it, watched it pass again.
- `client/src/three/diceSync.test.ts` (7 tests) and `client/src/diceSpawn.test.ts` (3 tests) cover the pure logic in isolation; `DiceManager` itself (real `HTMLCanvasElement`/`THREE.Sprite` APIs) isn't unit-testable under Vitest's `node` environment, same as `TableCanvas` in Milestone 5 — covered by the browser check below instead.
- Full `sanity-check` (lint/format/build/test, 154 tests across all 3 workspaces) clean, both mid-session and right before merge.
- **Real two-tab browser verification**: spawned a die (showed a "?" label), rolled it (resolved to a visible number, both tabs in sync), had the *second, non-host* player re-roll it live (both tabs updated to the new result simultaneously with no refresh), then removed it. No console errors on either tab.
- Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

Milestone 6 is done. Paste-to-start prompt:

> Start Milestone 7: soundboard & mute. `sound:play` (host-triggered, or per scope decided at the time) and `player:mute`/`player:unmute`. Exit check: host plays a sound, all players hear it; a muted player's state is visible to the group.

- **Branch:** `main` — none open. `feat/dice` merged and deleted.
- **State:** M1–M6 all done. Players can now spawn, roll, and remove 3D dice on the table, server-authoritative and visible to everyone live, alongside the room/avatars/map/drawing from earlier milestones.
- **Do next:** Milestone 7 per [docs/roadmap.md](roadmap.md) — first milestone touching audio.
- **Watch for:** the Chrome Pointer Lock automation restriction (M3+) and the Blender MCP concurrent-session gotcha (M3 part 2) if either comes up again. The PATH-after-install gotcha (`docs/engineering/tooling.md`) for `npm`/`node` in fresh Bash/PowerShell tool shells on this machine. `scene:create`/`scene:change` are still implemented/tested but not wired to UI (M5 scope cut) — unrelated to M7 but still true.
- **Environment:** nothing running — no dev server. Both ports confirmed clear at session end.

---

## 2026-09-24 (Milestone 5) — Tabletop map & drawing: the host swaps the map, players draw on the physical table, everyone sees it live

**Asked** (user): "continue with the next milestones" — after Milestone 4 finished (player avatars), picked up Milestone 5 per `docs/roadmap.md`. Two scope questions asked and answered before implementation: drawing interaction model (raycast-on-the-table while pointer-lock is released, not a flat 2D overlay) and scene scope (one active scene per session with a swappable background URL, not a full multi-scene manager) — both logged in `docs/decisions.md`.

### What landed

- **`shared`**: new `Point2D` type (`Drawing.points` now uses it instead of the original spec's `Vector3[]` — a stroke lives on a flat canvas, not in 3D space); the redundant top-level `GameState.drawings` field (duplicate of `Scene.drawings`, never consumed) dropped; `scene.ts` (`SceneCreateRequest`/`SceneChangeRequest`/`SceneUpdateRequest`, ack'd + full-state-broadcast like `session:join`) and `drawing.ts` (`DrawingStartRequest`/`DrawingUpdateRequest`/`DrawingEndRequest`/`DrawingDeleteRequest`, fire-and-forget like `player:move`). Both spec deviations logged in `docs/decisions.md` and `docs/engineering/architecture.md` per that file's own "Changing this spec" instruction.
- **`server`**: every session now seeds one default scene at creation (`createDefaultScene`, mirroring M2's implicit-session-creation pattern); `SessionStore.createScene/changeScene/updateScene` (host-gated) and `startDrawing/appendDrawingPoint/deleteDrawing` (not host-gated — any player can draw); matching validators in `validation.ts`; `scene:*` and `drawing:*` socket handlers in `server.ts` following the two existing sync patterns (ack + full broadcast for the infrequent host-gated scene events, fire-and-forget delta rebroadcast for the frequent drawing events, same as `player:move`).
- **`client`**: `TableCanvas.ts` (an offscreen `<canvas>` → `THREE.CanvasTexture`, `flipY: false`, redraws the background + all accumulated strokes on scene change, extends a stroke incrementally on live drawing updates); `tableTopUV.ts` (recomputes the `Table_Top` mesh's UV from local X/Z at runtime, since Blender's default cylinder unwrap splits top/side/bottom into separate islands rather than one clean square); `tableCoordinates.ts` (the shared local-XZ-to-canvas-pixel formula both the UV remap and the raycast input use, so a stroke always lands exactly under the cursor); `TableDrawing.ts` (raycasts pointer input against the table mesh while not pointer-locked). `RoomView.tsx` wires all of it together plus `scene:*`/`drawing:*` socket listeners; `SessionView.tsx` gained a host-only "Map background URL" form. The "click to look around" prompt shrank from a full-screen button to a small bottom pill (`style.css`), freeing the rest of the viewport for direct table interaction.
- Branch `feat/tabletop-map-drawing`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M5 exit-check test** (`server/src/tabletopMap.test.ts`, 5 tests): a host's map switch is seen live by another player and rejected for a non-host; a drawing stroke is seen live point-by-point (not just at the end) by another player; a later joiner's initial state already contains a fully-drawn stroke; `drawing:delete` is seen live. Break-round verified on both halves (scene broadcast and drawing broadcast disabled separately, each confirmed to fail the matching assertion, then restored).
- `client/src/three/tableTopUV.test.ts` and `tableCoordinates.test.ts` cover the coordinate math powering both texture display and drawing input, in isolation.
- Full `sanity-check` (lint/format/build/test, 120 tests across all 3 workspaces) clean, both mid-session and right before merge.
- **Real two-tab browser verification**: drew directly on the table via click-drag (raycast hit exactly under the cursor); host set a background image and the second tab updated live with no refresh; the second (non-host) player's own drawn stroke appeared live on the host's tab, correctly layered over the background. Hit and worked around a real external-network/CORS restriction in the sandboxed test browser (a live Wikimedia image failed to load — confirmed via `fetch(...).ok === false`, not an app bug) by substituting a `data:` URI generated in-page, which loaded and displayed correctly.
- Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

Milestone 5 is done. Paste-to-start prompt:

> Start Milestone 6: dice. `dice:spawn`/`dice:roll`/`dice:remove`, server-authoritative; 3D dice rendered and animated on the table, visible to everyone in the room regardless of where they're standing/looking. Exit check: any player spawns and rolls a die on the table; the result and motion are visible to everyone.

- **Branch:** `main` — none open. `feat/tabletop-map-drawing` merged and deleted.
- **State:** M1–M5 all done. The table now carries a live, swappable map with real-time collaborative drawing, on top of M1–M4's toolchain/sessions/room/avatars.
- **Do next:** Milestone 6 per [docs/roadmap.md](roadmap.md).
- **Watch for:** `scene:create`/`scene:change` are implemented and unit-tested server-side but not wired to any UI yet (deliberate M5 scope cut, see `docs/decisions.md`) — a multi-scene/map-switcher UI is the natural place to finally exercise them, if that need comes up. The Chrome Pointer Lock automation restriction (M3/M4) and the Blender MCP concurrent-session gotcha (M3 part 2) still apply if either comes up again. The PATH-after-install gotcha (`docs/engineering/tooling.md`) for `npm`/`node` in fresh Bash/PowerShell tool shells on this machine.
- **Environment:** nothing running — no dev server. Both ports confirmed clear at session end.

---

## 2026-09-23 (Milestone 4) — Player avatars: two+ players see each other walk around the room live

**Asked** (user): "continue with the next milestones" — after Milestone 3 finished (real Blender room), picked up Milestone 4 per `docs/roadmap.md`: `player:move` driving real 3D position/orientation, server-validated, with other connected players rendered as placeholder avatars.

### What landed

- **`shared`**: `Player.rotationY` (yaw only, radians — see `docs/decisions.md` for why not full orientation); `PlayerMoveRequest` (`shared/src/player.ts`) for the `player:move` payload, used both directions (client → server send, server → other clients rebroadcast); `DEFAULT_SPAWN_POSITION`, a shared constant so the client's camera spawn point and the server's default `Player.position` can't drift apart.
- **`server`**: `parsePlayerMoveRequest` (shape/finite-number validation, `validation.ts`); `SessionStore.move()` (updates a player's position/rotation in place, no-ops for an unknown session/player); a `player:move` socket handler (`server.ts`) that validates, applies, and rebroadcasts to everyone else in the session (`socket.to(sessionId).emit`, excluding the sender) — no ack, no full-state broadcast, matching the spec's "deltas, not full state" performance guidance.
- **`client`**: `PlayerAvatars.ts` (placeholder capsule meshes, one per other connected player, colored deterministically per player id) with membership (`sync`, driven by `GameState.players`) and live movement (`updateOne`, driven by `player:move` broadcasts) deliberately kept as separate methods — see `docs/decisions.md`. `FirstPersonController.getYaw()` (derives yaw from the camera's world direction rather than reading `camera.rotation.y`, which is wrong once pitch is non-zero under `PointerLockControls`'s internal Euler order). `RoomView.tsx` now takes `socket`/`sessionId`/`playerId`/`players` props, throttles outgoing `player:move` sends to ~10Hz (only when position/yaw actually changed), and wires incoming broadcasts to `PlayerAvatars.updateOne`. `App.tsx` passes the new props through.
- Branch `feat/player-avatars`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M4 exit-check test** (`server/src/playerMove.test.ts`): two real `socket.io-client`s — one moves, the other receives the broadcast live, the mover does *not* receive their own echo; a later joiner's initial `session:state` reflects an already-moved player's position; a malformed move is dropped without crashing the server. Break-round verified: removed the rebroadcast, watched the "sees it live" assertion time out and fail, restored it, watched it pass again.
- `client/src/three/PlayerAvatars.test.ts` (6 tests): create/update/remove/dispose, all against real `THREE.Group`/`Mesh`/`Geometry` objects — no WebGL/DOM needed for that under Vitest's `node` environment.
- Full `sanity-check` (lint/format/build/test, 68 tests across all 3 workspaces) clean, both mid-session and right before merge.
- **Real browser verification** (two Chrome tabs via browser automation): both players joined the same session, saw each other in the player list, room rendered with no console errors. **Known gap, same limitation as Milestone 3:** couldn't drive WASD through the automated browser to visually confirm a *moving* remote avatar end-to-end — Chrome rejects the automation tool's synthetic clicks for Pointer Lock (confirmed directly: `document.pointerLockElement` stayed null after a synthetic click). The server integration test and client unit tests cover what the browser check couldn't reach.
- Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

Milestone 4 is done. Paste-to-start prompt:

> Start Milestone 5: tabletop map & drawing. `scene:create`/`scene:change`/`scene:update` (host-only, server-validated); the 2D canvas (background image + drawing) renders as a `THREE.CanvasTexture` applied to the table surface, not full-screen; freehand drawing synced via `drawing:start`/`drawing:update`/`drawing:end`/`drawing:delete`, stroke-delta-only over the wire. Exit check: host switches the map on the table and all players see it change; any player draws on the table and everyone sees the stroke live, from wherever they're standing in the room.

- **Branch:** `main` — none open. `feat/player-avatars` merged and deleted.
- **State:** M1–M4 all done. Players now see each other as colored capsule avatars walking around the real Blender room in real time.
- **Do next:** Milestone 5 per [docs/roadmap.md](roadmap.md) — first milestone touching the 2D canvas/drawing layer and the table's `CanvasTexture`.
- **Watch for:** the Chrome Pointer Lock automation restriction if UI-testing movement again in this environment — a real (non-automated) browser session doesn't hit it. The Blender MCP concurrent-session gotcha (`docs/decisions.md`, M3 part 2) if Blender work resumes for M5/table texture work. The PATH-after-install gotcha (`docs/engineering/tooling.md`) for `npm`/`node` in fresh Bash/PowerShell tool shells on this machine.
- **Environment:** nothing running — no dev server, no Blender instance. Both ports confirmed clear at session end.

---

## 2026-09-23 (Milestone 3, part 2) — Real Blender room built and swapped in; Milestone 3 done

**Asked** (user): the standing next-session prompt — finish Milestone 3 by building the real room in Blender via the now-loaded `blender` MCP tools, exporting to `.glb`, and swapping it in via `RoomLoader.ts`'s `gltfUrl` option, replacing the procedural placeholder.

### What landed

- **Confirmed the `blender` MCP tools loaded** this session (fresh session, per the M3-split reasoning from part 1). Blender wasn't yet running — launched it, confirmed the addon connects (`get_addon_status`), ran the per-session ritual (`disable_telemetry`).
- **Built the room directly in Blender via `execute_blender_code`** (Python, not the UI): floor, four walls, round table (top/pedestal/base), rug, bookshelf + book blockouts, window + frame — matching `PLACEHOLDER_ROOM_LAYOUT`'s dimensions exactly (10m×8m room, 3m walls, table radius 1.1m/height 0.75m), so it's a pure asset swap with zero changes to `collision.ts`/`RoomLayout.ts`. See `docs/decisions.md` for the full reasoning.
- **Caught and fixed a real scale bug before it ever reached the browser**: Blender's `primitive_*_add(size=1)` shapes have half-extent 0.5, so an initial `.scale = (desired/2, ...)` halved everything again. Caught via `get_object_info`'s `world_bounding_box` (floor came out 5×4, not 10×8) before exporting — fixed and reverified dimensions with the same tool.
- **Exported to `client/public/models/room.glb`**, saved the editable source separately at `blender/room.blend` (not a web asset, kept out of `client/public/`). Wired `RoomView.tsx` to `loadRoom({ gltfUrl: '/models/room.glb' })`, replacing the procedural placeholder as the default.
- **Lighting: baking it into the glb (`export_lights=True`) badly overexposed the browser render** — verified visually via real Chrome browser automation (floor blew out to flat white). Root cause: Blender's Watt→candela conversion plus Three's physically-correct renderer having no tone mapping configured. Fixed by adding lighting directly in Three.js instead — new `client/src/three/RoomLighting.ts` (a `HemisphereLight` + two `PointLight`s in Three's own units) plus `renderer.toneMapping = ACESFilmicToneMapping` in `RoomView.tsx`. Iterated against real screenshots until materials read correctly (warm wood floor, distinguishable walls/table, no clipping to white/black).
- **Hit a concurrent-agent incident mid-session**: a subagent that should have been a no-op kept running after being told to stop, and — because Blender MCP's socket server is a single shared endpoint with no per-session isolation — built its own competing room in the same live Blender scene, leaving ~82 conflicting objects (including furniture this session never asked for). Caught via `get_scene_info` showing an unrecognized object name and an object count far above expected; stopped the agent (`TaskStop`) and wiped/rebuilt the scene clean. Logged as a gotcha in `docs/decisions.md` so it isn't rediscovered the hard way.
- Branch `feat/blender-room-asset`, squash-merged into local `main`. **Not pushed.**

### Checked

Full `sanity-check` pass (lint, format, build, 46 tests across all 3 workspaces) clean, both mid-session and right before merge. **Real browser verification** (Chrome, via browser automation — the first time this project has actually visually confirmed the WebGL canvas rather than reasoning about it from code): joined a session, confirmed the room renders with correct geometry/materials/lighting and `room.glb` fetches with a 200, no console errors. **Known gap:** Chrome's Pointer Lock API rejected the automation tool's synthetic clicks (a browser security restriction), so WASD movement couldn't be re-driven end-to-end in the browser this session — rests on the unchanged, already-unit-tested `collision.ts` suite instead (valid without re-verification since the real room's dimensions match the placeholder's exactly). Dev server processes confirmed stopped, ports 3001/5173 clear afterward.

### Next session

Milestone 3 is done. Paste-to-start prompt:

> Start Milestone 4: player avatars. `player:move` drives real 3D position/orientation, server-validated; other connected players render and move as avatars in the room in real time (placeholder capsule/mesh is fine). Exit check: two+ players in the same session see each other walk around the room live.

- **Branch:** `main` — none open. `feat/blender-room-asset` merged and deleted.
- **State:** M1–M3 all done. The real Blender room (`client/public/models/room.glb`, source at `blender/room.blend`) is the default room view; the procedural placeholder (`ProceduralRoom.ts`) remains as `loadRoom()`'s no-`gltfUrl` fallback, now otherwise unused.
- **Do next:** Milestone 4 per [docs/roadmap.md](roadmap.md).
- **Watch for:** the Blender MCP concurrent-session gotcha above if Blender work resumes — check `get_scene_info`'s object count/names look sane before trusting the scene, especially if any other agent/session might have touched it. Chrome's Pointer Lock restriction under automation if UI-testing movement again — a human tester in a real (non-automated) browser session doesn't hit this.
- **Environment:** nothing running — no dev server, no Blender instance left open. Node/npm need `C:\Program Files\nodejs` added to `$env:PATH` manually in a fresh PowerShell/Bash tool session on this machine (the documented PATH-after-install gotcha, `docs/engineering/tooling.md`) — `npm` isn't found otherwise even though the install itself is fine.

---

## 2026-09-23 (Milestone 3, part 1) — First-person movement engine, proven against a procedural room

**Asked** (user): "push then go for m3. ask me if you need decisions regarding ui/ux game design visual stuff etc." Pushed Milestone 2 to `origin/main`, then asked two design questions before starting: room aesthetic (**"cozy tabletop game room"** chosen over plain gray-box) and table shape/size (**round, 4-5 players** chosen).

### Setup, before implementation

- Checked `extraction_project` for reusable Blender MCP setup (per the standing instruction to always check that repo first) — Blender 5.2, its MCP add-on, and `uvx` were already installed there. Registered the same `blender` server in this repo's own new `.mcp.json` rather than reinstalling anything. Wrote `docs/engineering/blender-workflow.md` explaining what's reusable (the MCP setup itself) versus not (the FBX→Unreal pipeline — this project targets glTF/GLB→Three.js instead).
- **Realized MCP servers only load at session startup**, so this session doesn't have the `blender` tools yet — can't actually drive Blender. Split M3 into two parts rather than block on it (`docs/decisions.md`, "Milestone 3 split in two").

### What landed (part 1: the movement engine)

- **`client/src/three/collision.ts`**: pure `resolveMovement(position, delta, room, table, playerRadius)` — axis-separated wall/table collision with wall-sliding, plus an unconditional safety-net correction for an already-invalid starting position. 13 unit tests; two-stage break-round (partial disable, then a full passthrough gutting the function) confirmed the suite genuinely exercises the logic, not just the safety net — see `docs/decisions.md` for the nuance on why 3 of the 13 tests are correctly insensitive to the partial break (the safety net legitimately covers for it, which is the intended contract).
- **`client/src/three/FirstPersonController.ts`**: wraps Three.js's `PointerLockControls` for WASD + mouse-look, re-resolving every frame's position delta through `resolveMovement` before committing it.
- **`client/src/three/ProceduralRoom.ts`**: the placeholder room — walls, wood-toned floor, a round table (radius 1.1m, 4-5 players), a bookshelf/window blockout, warm point lighting. Built directly in Three.js, **not** the real Blender asset.
- **`client/src/three/RoomLoader.ts`**: `loadRoom()` — returns the procedural room by default, or loads a real `.glb` via `GLTFLoader` if a `gltfUrl` is given. Nothing calls it with a URL yet; this is the seam Part 2 plugs into.
- **`client/src/three/RoomView.tsx`** + **`App.tsx`**: joining a session now shows the full-viewport first-person room as the main view, with the session panel (code, player list, leave) as a small corner overlay — M2's functionality stays reachable, not replaced.
- Branch `feat/room-movement-engine`, squash-merged into local `main`. **Not pushed.**

### Checked

Full `sanity-check` pass (lint, format, build, 43 tests across all 3 workspaces) clean before and after the merge. Manual pass: ran the real `npm run dev` pair, confirmed both HTTP-responded and every new `three/`-path module transformed through Vite without error (can't visually confirm the WebGL canvas in this environment — reasoned about correctness from the code and Vite's clean transform instead). **Found and cleaned up two full leftover `npm run dev` process trees from earlier work that were still listening on 3001/5173** (orphaned `tsx watch` children survive a plain `Stop-Process` on their parent — needed `taskkill /T` to actually kill the tree); confirmed both ports clear afterward.

### Next session

Paste-to-start prompt:

> Finish Milestone 3: build the real room + round table (4-5 players, "cozy tabletop game room") in Blender, export to `.glb`, and swap it in via `client/src/three/RoomLoader.ts`'s `gltfUrl` option, replacing the procedural placeholder. Blender itself is already installed — this just needs a fresh session so the `blender` MCP tools (registered in `.mcp.json`) actually load; check with `ToolSearch` or by looking for `blender`-prefixed tools before assuming they're missing.

- **Branch:** `main` — none open.
- **State:** M1 and M2 done. M3 part 1 (movement engine) done and merged; M3 part 2 (real Blender room) not started. `main` is ahead of `origin/main` — this session's work hasn't been pushed.
- **Do next:** the Blender room build above, per [docs/engineering/blender-workflow.md](engineering/blender-workflow.md) (which still has a "not yet built" status section to fill in once this actually happens) and [docs/roadmap.md](roadmap.md)'s M3 entry.
- **Watch for:** the fresh-session requirement for MCP tools; re-verify collision/exit-check behavior once real room dimensions replace the placeholder's (10m×8m room, 1.1m table radius) in case they differ enough to matter.
- **Environment:** nothing running; both dev-server ports confirmed clear at session end.

---

## 2026-09-23 (Milestone 2) — Sessions, host role, and reconnect: two clients can join and see each other

**Asked** (user): "continue with milestone 2 i will set up th remote in the mean time" — build sessions & connection per [docs/roadmap.md](roadmap.md).

### What landed

- **`shared`**: `SocketEvent.SessionState` (a new broadcast event — the spec named `session:join`/`session:leave` but not how the resulting state reaches clients) and `session.ts` (the `SessionJoinRequest`/`Response`, `SessionLeaveRequest`/`Response` payload shapes, also not specified originally).
- **`server`**: `sessionStore.ts` (an in-memory `Map<sessionId, GameState>` registry — first joiner becomes host, rejoining with the same `playerId` rebinds rather than duplicates, leaving empties/deletes the session) and `validation.ts` (runtime guards rejecting malformed `session:join`/`session:leave` payloads without crashing a handler). Wired into `server.ts`: `session:join`/`session:leave` handlers with ack callbacks, plus a room broadcast (`session:state`) on every membership change.
- **`client`**: `playerIdentity.ts` (a `sessionStorage`-backed stable id per tab — deliberately *not* `localStorage`, see below), `sessionCode.ts` (a short shareable code generator), `JoinForm.tsx` and `SessionView.tsx` (name + session-code entry, live player list with the host labeled), and `App.tsx` rewritten to wire them to the socket, including auto-rejoin on reconnect (a dropped/reconnected socket re-sends the last successful `session:join` automatically).
- Four design calls made and logged in [decisions.md](decisions.md): implicit session creation on first join, host role derived from `hostId` rather than stored per-player (host migration explicitly deferred), disconnect ≠ leave (a dropped client's `Player` record stays until an explicit leave), and `sessionStorage` over `localStorage` for identity (so two tabs of one browser stay distinct players).
- Branch `feat/sessions-connection`, squash-merged into local `main`. **Not pushed.**

### Checked

- **The M2 exit-check test** (`server/src/session.test.ts`): two real `socket.io-client`s join the same session; each sees the other in the resulting player list, host is correctly the first joiner. Break-round verified: removed the room broadcast, watched the "Alice sees Bob join" assertion time out and fail, restored it, watched it pass again. Also covers disconnect → rejoin-same-identity (no duplicate) → leave, and a malformed-payload rejection that doesn't take the server down.
- `sessionStore.test.ts` (6 unit tests) and `validation.test.ts` (15 unit tests, `it.each` over malformed payloads) cover the registry and guards in isolation.
- `npm run lint`/`format:check`/`build`/`test` all clean across `shared`/`server`/`client` — verified before committing and again after the squash-merge onto `main`.
- Manually smoke-tested against the real `npm run dev` process pair (not just the in-process test): `curl`'d `/health` and the Vite dev page, then ran two independent `socket.io-client` connections against the live server — both joins succeeded with correct player lists. One nuance, not a defect: a one-shot manual script's `.once()` listener caught a different (but still correct-at-the-time) broadcast than the in-process test does, explained in [decisions.md](decisions.md) — the real client uses a persistent `.on()` listener and isn't affected. Dev server processes confirmed stopped afterward (nothing on 3001/5173).
- **`git remote -v` now shows `origin` → `https://github.com/Chanumask/custom_tabletop.git`** (fetch+push) — the user set this up in parallel per their prompt. Nothing has been pushed to it from this session.

### Next session

Paste-to-start prompt:

> Start Milestone 3: a placeholder Blender room + table exported as glTF/GLB and loaded via Three.js's GLTFLoader, first-person camera with WASD + mouse-look movement, and collision against the walls/table. Solo exploration only — no other players visible yet (that's Milestone 4), no map/dice. Exit check: a player joins a session and can walk around a 3D room and bump into the table/walls without clipping through them.

- **Branch:** `main` — none open. `feat/sessions-connection` merged and deleted.
- **State:** sessions/connection working end to end (join, live player list, host label, reconnect). Still just a flat HTML page — no 3D/room work has started.
- **Do next:** Milestone 3 per [docs/roadmap.md](roadmap.md) — this is where the Blender/Three.js pipeline actually starts. Check `extraction_project`'s `docs/engineering/blender-workflow.md` first for the reusable parts of its Blender MCP setup (the add-on/server/per-session steps) before setting that up from scratch — its FBX→Unreal import mechanics don't transfer (we're glTF→Three.js), but the MCP setup itself is stack-agnostic. See memory or ask if this isn't already front-of-mind.
- **Watch for:** `hostId` can point at a departed player once someone leaves (host migration is deferred, see `decisions.md`) — not relevant yet since nothing is host-gated until Milestone 5, but don't be surprised by it later. The PATH-after-Node-install gotcha in [engineering/tooling.md](engineering/tooling.md) still applies to every fresh shell on this machine.
- **Environment:** nothing running — no dev server. A git remote (`origin`) now exists; whether/when to push is still an explicit per-instance ask, unchanged.

---

## 2026-09-23 (Milestone 1) — Toolchain scaffolded: npm workspaces, WebSocket round trip verified

**Asked** (user): "kick off m1" — build the toolchain scaffold per [docs/roadmap.md](roadmap.md).

### What landed

- **Node.js 24 LTS installed** via winget (`OpenJS.NodeJS.LTS`), after confirming with the user first since it's a machine-wide change, not a repo-local one.
- **npm workspaces** (`shared`, `server`, `client`), root `package.json`/`tsconfig.base.json`/`eslint.config.js` (flat config, `typescript-eslint` + React hooks/refresh rules for `client`)/`.prettierrc`/`.nvmrc`.
- **`shared`**: `GameState`/`Scene`/`Player` types and the spec's event names (`SocketEvent`) carried over from [engineering/architecture.md](engineering/architecture.md), plus placeholder `Character`/`Drawing`/`Dice`/`SoundState` shapes for milestones that don't exist yet. Added an infra-only `ConnectionEvent` (`connection:ping`/`pong`) for this milestone's exit check. Consumed as plain TS source by both other workspaces — no build step (see [engineering/tooling.md](engineering/tooling.md), new this session).
- **`server`**: Express (`/health`) + Socket.IO on one HTTP server, port 3001, connection/disconnection logging, `dev` via `tsx watch`.
- **`client`**: hand-rolled Vite + React + TypeScript (no interactive `create-vite`, no stdin available) — a connection-status page that pings the server on connect and shows the round trip succeeding.
- Branch `build/m1-toolchain-scaffold`, squash-merged into local `main`. **Not pushed.**

### Checked

- Every workspace's `build` (type-check, plus `vite build` for `client`), `lint`, `format:check`, and `test` pass clean — verified twice (before and right before commit, per the `sanity-check` skill).
- **The M1 exit-check test** (`server/src/server.test.ts` — a real server, a real `socket.io-client`, a real ping/pong round trip) was break-round verified: disabled the pong handler, watched the test fail with a timeout, restored it, watched it pass again. Not a false positive.
- Also smoke-tested outside Vitest: ran the real `tsx` dev process and `curl`'d `/health` for a real HTTP response, then confirmed the process was stopped afterward (port 3001 unreachable) — nothing left running.
- `npm audit` flags 5 advisories in `vite`/`esbuild`/`vitest` dev-server code paths; accepted for now rather than force-upgrading to breaking major versions mid-milestone (logged in [decisions.md](decisions.md) and [engineering/tooling.md](engineering/tooling.md)).
- Hit and logged one real gotcha: TS project references from `server`/`client` to `shared` don't work when `shared` has no build step (`tsc` requires referenced projects to be `composite` and emit) — dropped the references, plain `node_modules` resolution works fine instead (logged in [decisions.md](decisions.md)).

### Next session

Paste-to-start prompt:

> Start Milestone 2: session:join/leave, a server-side session registry, host vs. player role assignment, a server-authoritative GameState shell broadcast to a session's clients, and basic reconnect handling. Exit check: two+ browser tabs join the same session and see each other in a player list.

- **Branch:** `main` — none open. `build/m1-toolchain-scaffold` merged and deleted.
- **State:** toolchain scaffolded and verified (lint/format/build/test all clean, WebSocket round trip proven both by test and by a real dev-server run). No session/game-state logic yet.
- **Do next:** Milestone 2 per [docs/roadmap.md](roadmap.md).
- **Watch for:** the PATH-after-Node-install gotcha in [engineering/tooling.md](engineering/tooling.md) if `node`/`npm` seem to have vanished again in a stale shell. `shared`'s placeholder types (`Character`, `Drawing`, `Dice`, `SoundState`) are minimal stand-ins — expect to extend them as each consuming milestone lands, not treat them as final.
- **Environment:** nothing running — no dev server, no editor state. `npm install` already run at the repo root.

---

## 2026-09-23 — Repo scaffolded, then the player-experience direction settled: a walkable 3D room

**Asked** (user): set up a basic, non-overkill repo (version control + proper workflow) for the virtual-tabletop project described in a handed-over design specification, reusing the process/workflow docs from the sibling `extraction_project` repo, and present a build roadmap with milestones.

### What landed — repo setup

- Read the design specification (tech stack, architecture, event model, client state shape, sync/authority model, performance approach, project structure — preserved at [docs/engineering/architecture.md](engineering/architecture.md)).
- Read `extraction_project`'s `CLAUDE.md`, `docs/process/*`, `docs/overview.md`, `docs/decisions.md`, `docs/changelog.md`, and its `feature-workflow`/`sanity-check` skills to reuse the pattern.
- Set up this repo: `CLAUDE.md`, `README.md`, `docs/overview.md`, `docs/roadmap.md`, `docs/decisions.md`, `docs/changelog.md` (this file), `docs/process/` (`README.md`, `git-workflow.md`, `session-handover.md`), `docs/engineering/` (`README.md`, `architecture.md`), `.claude/skills/` (`feature-workflow`, `sanity-check`), `.gitignore`, and empty `client/`/`server/`/`shared/` placeholders for Milestone 1.
- Initialized git, made the initial scaffold commit directly to `main` (docs/config only — no application code yet).

### Checked

Node.js is **not installed** on this machine — confirmed via `node --version` failing in both bash and PowerShell. This is why Milestone 1 starts with toolchain install rather than assuming it's there.

### What landed — player-experience direction

**Asked** (user, follow-up): hadn't read the spec message directly — asked what the player experience actually is per the spec, then described their own vision (a Blender-generated 3D room with a table/map and interactables) and whether it's compatible.

Walked through the spec's implied experience (2D top-down map filling the screen, 3D dice/figures as an accent layer over it — the Roll20/Foundry model) versus the user's vision (a walkable 3D room), and assessed them as compatible: the event model, `GameState` shape, delta-only sync, and server authority are untouched either way — only *where* the map/drawing renders and how the player moves changes. Asked the user to pick a camera model (fixed/orbit vs. free first-person vs. hybrid); **they chose free first-person walk-around**, the more ambitious/immersive option.

Updated docs to make this the standing plan rather than a chat-only decision: [decisions.md](decisions.md) (new entry), [engineering/architecture.md](engineering/architecture.md) (new "Extension" section — original spec kept intact below it, since the event model/stack still apply), [roadmap.md](roadmap.md) (reordered: room + first-person movement now land before the tabletop map/drawing milestone, since the room is the primary view rather than an overlay), `overview.md` and `CLAUDE.md` (updated framing).

### Next session

Paste-to-start prompt:

> Start Milestone 1: install Node.js, set up the npm workspace (`client`/`server`/`shared`), scaffold a Vite+React client and a Node+TypeScript+Socket.IO server, wire up ESLint/Prettier and a test runner, and get one WebSocket round-trip working end to end. (Milestone 3 is where the 3D room/first-person movement actually starts — Milestone 1 is just the toolchain.)

- **Branch:** `main` — none open.
- **State:** repo/docs/workflow scaffolded, player-experience direction (walkable 3D room, first-person) decided and documented. No application code yet.
- **Do next:** Milestone 1 per [docs/roadmap.md](docs/roadmap.md).
- **Watch for:** Node.js isn't installed yet — that's the first step, not an assumption to skip. Milestone 1 has no 3D/room work in it yet — don't jump ahead to Blender/Three.js setup before the basic client/server/shared scaffold and WebSocket round-trip are working.
- **Environment:** nothing running; no editor/dev-server state to verify.
