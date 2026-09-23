# Architecture & Tech Stack

← [CLAUDE.md](../../CLAUDE.md) · [engineering index](README.md)

This is the original design specification handed over at project start, lightly reformatted into the docs hierarchy, **plus one deliberate extension decided 2026-09-23** (see the section right below and [decisions.md](../decisions.md)). It's the default plan, not a locked spec — the note at the bottom of this file says how to change it once real implementation surfaces reasons to.

## Extension: a walkable 3D room, not a 2D map with 3D accents

The spec below (as originally written) describes a **2D-canvas-first VTT**: a top-down map fills the screen, and Three.js/WebGL supplies an accent layer on top of it — 3D dice, 3D player figures, floating independently over the 2D canvas/UI. That's the Roll20/Foundry model.

**The actual product vision is different and takes priority where the two conflict:** the player is placed in a **fully 3D, Blender-built room** — walls, a big physical table, and interactable furniture — and moves through it in **free first-person** (WASD + mouse-look, collision against walls/table/furniture). The map and drawing layer aren't a full-screen 2D canvas; they're a **physical surface on the table inside that room**.

This does *not* invalidate the rest of the spec — it changes where a few pieces render, not the event model, sync strategy, or server authority:

- **The 2D `<canvas>` still exists and drawing still works exactly as specified** (`drawing:start/update/end/delete`, same delta-only payloads) — it's just never shown full-screen. Its pixels feed a `THREE.CanvasTexture` applied to a plane/mesh on the tabletop, so a stroke drawn on the map appears on the table surface inside the room, live, for everyone. This is a standard, well-supported Three.js technique, not a research problem.
- **`Player.position` (`x, y, z`) already anticipated a 3D position** in the original spec's `GameState` shape — that field now drives a walking first-person avatar instead of a token on a flat map. No shared-type change needed, just what consumes it.
- **Dice and "future 3D tabletop objects" were already scoped for Three.js** in the original spec — a room, a table, and interactable furniture (dice tray, shelves, etc.) are more of exactly that bucket, not new territory.
- **Server authority, session/scene events, and the performance approach (deltas, not full state) are unchanged.**

What's genuinely new, not implied by the original spec:

- **Asset pipeline:** room/furniture/table modeled in **Blender**, exported as **glTF/GLB**, loaded client-side with Three.js's `GLTFLoader`. This is the standard free pipeline for this stack — no new dependency category, just a workflow to set up (export settings, draco/meshopt compression once assets get heavier).
- **Movement & collision:** first-person camera controls and collision against room geometry (walls, table, furniture) — real added scope the flat-map version wouldn't have needed.
- **Interactables:** objects in the room beyond the map/dice that a player can approach and use (dice tray, shelf, etc.) — will need their own event(s) (e.g. `object:interact`) and server validation, following the same host/player-authority pattern as everything else in the spec.

See [roadmap.md](../roadmap.md) for how this reorders the build (room + movement now come before the tabletop map/drawing feature, since the room is the primary view, not an overlay on it).

## Technischer Stack

Die Anwendung soll vollständig als webbasierte Anwendung umgesetzt werden.

### Grundanforderung

* Client läuft im modernen Webbrowser.
* Kein nativer Desktop-Client erforderlich.
* Backend basiert auf **Node.js**.
* Kommunikation zwischen Browsern und Server erfolgt über eine Echtzeitverbindung.
* Die Anwendung soll auf aktuellen Desktop-Browsern wie Chrome, Edge und Firefox funktionieren.

### Empfohlener Stack

#### Frontend

* HTML5
* CSS
* TypeScript
* modernes JavaScript-Frontend-Framework, vorzugsweise React
* 2D Canvas für das gemeinsame Zeichnen
* WebGL für 3D-Rendering
* Three.js für 3D-Objekte wie:

  * Spielerfiguren
  * Würfel
  * zukünftige 3D-Tabletop-Objekte

#### Backend

* Node.js
* TypeScript
* REST API für nicht zeitkritische Operationen
* WebSockets bzw. Socket.IO für Echtzeitkommunikation

#### Echtzeitkommunikation

Die Multiplayer-Kommunikation soll über WebSockets bzw. eine vergleichbare persistente Echtzeitverbindung erfolgen.

Beispiele für Events:

```text
session:join
session:leave

scene:create
scene:change
scene:update

drawing:start
drawing:update
drawing:end
drawing:delete

player:move

dice:spawn
dice:roll
dice:remove

sound:play

player:mute
player:unmute
```

Die konkrete Event-Struktur kann während der Implementierung angepasst werden.

---

## Architektur

Grundsätzlich soll die Anwendung nach folgendem Modell aufgebaut werden:

```text
                    ┌──────────────────┐
                    │   Node.js Server │
                    │                  │
                    │ Session State    │
                    │ WebSocket Server │
                    └────────┬─────────┘
                             │
               ┌─────────────┼─────────────┐
               │             │             │
               ▼             ▼             ▼
         ┌──────────┐  ┌──────────┐  ┌──────────┐
         │ Browser  │  │ Browser  │  │ Browser  │
         │ Host     │  │ Player 1 │  │ Player 2 │
         └──────────┘  └──────────┘  └──────────┘
```

Der Server verwaltet den gemeinsamen Zustand der Session und verteilt Änderungen an die verbundenen Clients.

---

## Rendering

Das Frontend besteht aus mehreren logisch getrennten Ebenen.

```text
Browser
│
├── UI Layer
│
├── 2D Canvas
│   ├── Scene Background
│   ├── Player Drawings
│   └── Host Drawings
│
└── 3D WebGL Layer
    ├── Player Characters
    ├── Dice
    └── zukünftige 3D Objects
```

Die 3D-Ebene soll möglichst unabhängig von der normalen UI funktionieren.

Insbesondere soll ein 3D-Würfel über dem normalen Canvas/UI dargestellt werden können.

---

## Client State

Der Client soll zwischen lokalem UI-Zustand und synchronisiertem Session-Zustand unterscheiden.

### Synchronisierter Zustand

Beispielsweise:

```typescript
interface GameState {
    sessionId: string;
    hostId: string;
    activeSceneId: string;

    scenes: Scene[];

    players: Player[];

    drawings: Drawing[];

    dice: Dice[];

    soundboard: SoundState[];
}
```

**Implementation deviation (Milestone 5, logged in [decisions.md](../decisions.md)):** the actual `GameState` has no top-level `drawings` field — it was redundant with `Scene.drawings` (both keyed by the same `sceneId`) and nothing ever consumed it. `Drawing.points` is also `Point2D[]` (a new 2D-canvas-pixel type), not `Vector3[]` — a drawing stroke lives on a flat canvas texture, not in 3D world space.

### Szene

```typescript
interface Scene {
    id: string;
    name: string;
    backgroundImage: string;

    drawings: Drawing[];
}
```

### Spieler

```typescript
interface Player {
    id: string;
    name: string;

    character: Character;

    position: {
        x: number;
        y: number;
        z: number;
    };

    muted: boolean;
}
```

---

## Autorität und Synchronisierung

Der Server soll als zentrale Autorität für den gemeinsamen Spielzustand fungieren.

Insbesondere sollten folgende Aktionen serverseitig validiert werden:

* Host-Rechte
* Szene wechseln
* Szene erstellen/löschen
* Würfel spawnen
* Würfel entfernen
* Spieler muten
* Spielerpositionen
* Join/Leave

Clients dürfen keine Host-Aktionen allein durch lokale Manipulation ausführen können.

Die Clients erhalten anschließend den aktualisierten Zustand bzw. die entsprechenden Events.

---

## Performance

Da Zeichnen und Spielerbewegungen sehr viele Echtzeitdaten erzeugen können, darf nicht bei jeder Änderung der komplette Game State übertragen werden.

Beispiel beim Zeichnen:

```text
Client
  │
  │ drawing:start
  ▼
Server
  │
  ├── Player 1
  ├── Player 2
  └── Player 3
```

Es sollen möglichst nur die notwendigen Änderungen übertragen werden.

Bei einem Zeichenstrich beispielsweise:

```typescript
{
    drawingId: "...",
    sceneId: "...",
    playerId: "...",
    points: [...]
}
```

statt jedes Mal das komplette Canvas-Bild zu übertragen.

---

## Browser-Anforderungen

Die Anwendung soll ohne zusätzliche Installation funktionieren.

Unterstützte Browser mindestens:

* Google Chrome
* Microsoft Edge
* Mozilla Firefox

Safari sollte nach Möglichkeit ebenfalls unterstützt werden.

Erforderliche Browser-Technologien:

* WebSocket
* Canvas API
* WebGL
* moderne JavaScript-/TypeScript-Funktionen

---

## Entwicklungsumgebung

Empfohlene Projektstruktur:

```text
custom_tabletop/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── canvas/
│   │   ├── scene/
│   │   ├── three/
│   │   ├── dice/
│   │   ├── players/
│   │   └── soundboard/
│   │
│   └── ...
│
├── server/
│   ├── src/
│   │   ├── sessions/
│   │   ├── websocket/
│   │   ├── scenes/
│   │   ├── players/
│   │   └── game-state/
│   │
│   └── ...
│
├── shared/
│   ├── types/
│   ├── events/
│   └── game-state/
│
└── package.json
```

Die gemeinsamen TypeScript-Typen und Event-Definitionen sollten nach Möglichkeit in einem `shared`-Bereich liegen, damit Client und Server dieselben Datenmodelle verwenden.

---

## Technologieentscheidungen

Der konkrete Stack soll möglichst einfach und wartbar bleiben.

**Pflicht:**

* Browser
* Node.js
* TypeScript
* WebSocket-basierte Echtzeitkommunikation
* HTML5 Canvas
* WebGL

**Empfohlen:**

* React für UI
* Three.js für 3D
* Socket.IO oder native WebSockets für Multiplayer

Die konkreten Bibliotheken dürfen durch den implementierenden Agenten angepasst werden, sofern die funktionalen Anforderungen erhalten bleiben.

---

## Changing this spec

If implementation surfaces a good reason to deviate (a library, an event name, a layer boundary), don't just diverge quietly — log the change and why in [decisions.md](../decisions.md), then update this file so it stays the accurate description of the architecture rather than a historical artifact.
