// Builds the eight player character models (client/public/models/characters/
// <color>.glb) from the Quaternius "Ultimate Modular Men/Women" packs
// (CC0 — see blender/source-assets/README.md for where to download them).
//
//   node scripts/build-characters.mjs
//
// For each player color it takes one distinct character and:
//  - gives the character's shirt its *own* material named "Shirt", with a
//    white base color, so the client can tint exactly the shirt to the
//    player's color (the source packs share material names like "White" or
//    "Pink" between the shirt and other parts, e.g. a punk's mohawk);
//  - keeps only the animations the game uses (idle/walk/run + emotes);
//  - prunes/dedups and writes a compact binary .glb.
//
// Reproducible from the raw packs, so the packs themselves stay out of git.

import path from 'node:path';
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample } from '@gltf-transform/functions';

const ROOT = path.resolve(import.meta.dirname, '..');
const PACKS = {
  men: path.join(
    ROOT,
    'blender/source-assets/Ultimate Modular Men- Feb 2022/Individual Characters/glTF',
  ),
  women: path.join(
    ROOT,
    'blender/source-assets/Ultimate Modular Women - April 2022/Individual Characters/glTF',
  ),
};
const OUT_DIR = path.join(ROOT, 'client/public/models/characters');

/** Player color -> character. `shirt` is the source material on the
 * character's `*_Body` part that is its top. Chosen so all eight read as
 * different people (four men, four women — the witch and the hoodie were
 * added for tables of eight; different hair, beard,
 * mohawks, backpack/vest) and so each shirt color sits well with the rest
 * of the outfit (the purple top next to a magenta mohawk, the orange tank
 * next to a red one). */
const CHARACTERS = [
  { color: 'red', pack: 'men', file: 'Casual_2', shirt: 'LightBrown' },
  { color: 'blue', pack: 'women', file: 'Casual', shirt: 'White' },
  { color: 'green', pack: 'men', file: 'Adventurer', shirt: 'Green' },
  { color: 'yellow', pack: 'women', file: 'Adventurer', shirt: 'LightGreen' },
  { color: 'purple', pack: 'women', file: 'Punk', shirt: 'Pink' },
  { color: 'orange', pack: 'men', file: 'Punk', shirt: 'White' },
  { color: 'pink', pack: 'women', file: 'Witch', shirt: 'Purple' },
  { color: 'teal', pack: 'men', file: 'Casual_Hoodie', shirt: 'Purple' },
];

/** Locomotion plus the emotes (client/src/three/emotes.ts). */
const KEEP_ANIMATIONS = new Set([
  'Idle',
  'Walk',
  'Run',
  'Wave',
  'Interact',
  'Death',
  'Punch_Right',
  'Kick_Left',
  'Roll',
  'HitRecieve',
]);

const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const character of CHARACTERS) {
  const source = path.join(PACKS[character.pack], `${character.file}.gltf`);
  const document = await io.read(source);
  const root = document.getRoot();

  const body = root.listNodes().find((node) => node.getName().endsWith('_Body'));
  const primitive = body
    ?.getMesh()
    ?.listPrimitives()
    .find((candidate) => candidate.getMaterial()?.getName() === character.shirt);
  if (!primitive) {
    throw new Error(`${character.file}: no "${character.shirt}" primitive on the *_Body part`);
  }
  const shirt = primitive.getMaterial().clone().setName('Shirt').setBaseColorFactor([1, 1, 1, 1]);
  primitive.setMaterial(shirt);

  for (const animation of root.listAnimations()) {
    if (!KEEP_ANIMATIONS.has(animation.getName())) {
      animation.dispose();
    }
  }
  const kept = root.listAnimations().map((animation) => animation.getName());
  const missing = [...KEEP_ANIMATIONS].filter((name) => !kept.includes(name));
  if (missing.length > 0) {
    throw new Error(`${character.file}: missing animations ${missing.join(', ')}`);
  }

  root.listScenes()[0]?.setName(`character-${character.color}`);
  // resample() drops keyframes that lie on the curve anyway — same motion,
  // a fraction of the animation data.
  // quantize() stores vertex data in KHR_mesh_quantization's compact
  // integer formats, which three.js's GLTFLoader reads natively.
  await document.transform(resample(), prune(), dedup(), quantize());

  const out = path.join(OUT_DIR, `${character.color}.glb`);
  await io.write(out, document);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`${character.color.padEnd(7)} <- ${character.pack}/${character.file} (${kb} KB)`);
}
