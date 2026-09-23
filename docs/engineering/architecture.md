# Architecture & Tech Stack

← [CLAUDE.md](../../CLAUDE.md) · [engineering index](README.md)

This is the original design specification handed over at project start, lightly reformatted into the docs hierarchy. It's the default plan, not a locked spec — see [decisions.md](../decisions.md) for why it's taken as given rather than re-litigated, and the note at the bottom of this file for how to change it once real implementation surfaces reasons to.

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
