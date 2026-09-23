/**
 * Request/response payload shapes for the scene:* events (Milestone 5).
 * Host-only, server-validated (docs/engineering/architecture.md's
 * "Autorität und Synchronisierung" lists "Szene wechseln" and "Szene
 * erstellen/löschen" explicitly). Infrequent, so — unlike player:move or
 * drawing:* — these get a real ack and a full GameState broadcast, the same
 * pattern as session:join/leave.
 */
import type { GameState } from './types.js';

export interface SceneCreateRequest {
  sessionId: string;
  playerId: string;
  /** Client-generated (crypto.randomUUID()), same pattern as playerId. */
  sceneId: string;
  name: string;
  backgroundImage: string;
}

export type SceneCreateResponse = { ok: true; state: GameState } | { ok: false; error: string };

export interface SceneChangeRequest {
  sessionId: string;
  playerId: string;
  sceneId: string;
}

export type SceneChangeResponse = { ok: true; state: GameState } | { ok: false; error: string };

export interface SceneUpdateRequest {
  sessionId: string;
  playerId: string;
  sceneId: string;
  name?: string;
  backgroundImage?: string;
}

export type SceneUpdateResponse = { ok: true; state: GameState } | { ok: false; error: string };
