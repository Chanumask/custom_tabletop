import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadRoom } from './RoomLoader.js';
import { FirstPersonController } from './FirstPersonController.js';
import { PLAYER_EYE_HEIGHT } from './RoomLayout.js';

/** Full first-person view of the room: renders the placeholder scene (or,
 * once it exists, the real Blender-exported room via `loadRoom`'s
 * `gltfUrl` option) and drives WASD + mouse-look movement through
 * `FirstPersonController`. Click-to-lock, Esc (browser default) to release. */
export function RoomView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<FirstPersonController | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let disposed = false;
    let animationFrameId = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1410);

    const camera = new THREE.PerspectiveCamera(
      70,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.1,
      100,
    );
    camera.position.set(0, PLAYER_EYE_HEIGHT, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const clock = new THREE.Clock();

    const handleResize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    void loadRoom().then((room) => {
      if (disposed) {
        return;
      }
      scene.add(room.object3D);

      const controller = new FirstPersonController({
        camera,
        domElement: renderer.domElement,
        room: room.layout.bounds,
        table: room.layout.table,
      });
      controller.connect();
      controller.controls.addEventListener('lock', () => setLocked(true));
      controller.controls.addEventListener('unlock', () => setLocked(false));
      controllerRef.current = controller;

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        controller.update(clock.getDelta());
        renderer.render(scene, camera);
      };
      animate();
    });

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      controllerRef.current?.dispose();
      controllerRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="room-view">
      {!locked && (
        <button
          type="button"
          className="room-view-overlay"
          onClick={() => controllerRef.current?.controls.lock()}
        >
          Click to look around
          <br />
          WASD to move · mouse to look · Esc to release
        </button>
      )}
    </div>
  );
}
