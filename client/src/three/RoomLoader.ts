import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLACEHOLDER_ROOM_LAYOUT, type RoomLayout } from './RoomLayout.js';
import { buildProceduralRoom } from './ProceduralRoom.js';

export interface RoomAsset {
  object3D: THREE.Object3D;
  layout: RoomLayout;
}

export interface LoadRoomOptions {
  /**
   * Path to a Blender-exported `.glb`, once one exists (Milestone 3's second
   * half — see docs/engineering/blender-workflow.md). Omitted (the default):
   * falls back to the procedural placeholder built directly in Three.js.
   * This is the seam that lets the real asset replace the placeholder
   * without touching any movement/collision code, which only depends on
   * `RoomAsset.layout`, not on how the geometry was produced.
   */
  gltfUrl?: string;
  layout?: RoomLayout;
}

export async function loadRoom(options: LoadRoomOptions = {}): Promise<RoomAsset> {
  const layout = options.layout ?? PLACEHOLDER_ROOM_LAYOUT;

  if (options.gltfUrl) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(options.gltfUrl);
    return { object3D: gltf.scene, layout };
  }

  return { object3D: buildProceduralRoom(layout), layout };
}
