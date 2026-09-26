import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Lectern } from './Lectern.js';

describe('the lectern', () => {
  it('stands a spine on its shelf for each of the host’s books, in its cover', () => {
    const scene = new THREE.Scene();
    const lectern = new Lectern(scene, null);
    const spines = () =>
      lectern.group.children.filter(
        (child) => child instanceof THREE.Mesh && child.visible && child.children.length === 2,
      );
    expect(spines()).toHaveLength(0);
    lectern.setBooks([
      { id: 'a', title: 'A', text: '', cover: 1 },
      { id: 'b', title: 'B', text: '', cover: 4 },
    ]);
    expect(spines()).toHaveLength(2);
    lectern.setBooks([]);
    expect(spines()).toHaveLength(0);
    lectern.dispose();
    expect(scene.getObjectByName('lectern')).toBeUndefined();
  });
});
