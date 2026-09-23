import { describe, expect, it } from 'vitest';
import {
  parseSessionJoinRequest,
  parseSessionLeaveRequest,
  parsePlayerMoveRequest,
  parseSceneCreateRequest,
  parseSceneChangeRequest,
  parseSceneUpdateRequest,
  parseDrawingStartRequest,
  parseDrawingUpdateRequest,
  parseDrawingEndRequest,
  parseDrawingDeleteRequest,
  parseDiceSpawnRequest,
  parseDiceRollRequest,
  parseDiceRemoveRequest,
  parseSoundPlayRequest,
  parsePlayerMuteRequest,
  parsePlayerUnmuteRequest,
} from './validation.js';

describe('parseSessionJoinRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    const result = parseSessionJoinRequest({
      sessionId: ' abc ',
      playerId: ' p1 ',
      playerName: ' Alice ',
    });
    expect(result).toEqual({ sessionId: 'abc', playerId: 'p1', playerName: 'Alice' });
  });

  it.each([
    [null],
    [undefined],
    ['a string'],
    [42],
    [{}],
    [{ sessionId: 'abc', playerId: 'p1', playerName: '' }],
    [{ sessionId: '   ', playerId: 'p1', playerName: 'Alice' }],
    [{ sessionId: 'abc', playerId: 123, playerName: 'Alice' }],
    [{ sessionId: 'abc', playerName: 'Alice' }],
  ])('rejects malformed payload %#', (payload) => {
    expect(parseSessionJoinRequest(payload)).toBeNull();
  });
});

describe('parseSessionLeaveRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    expect(parseSessionLeaveRequest({ sessionId: ' abc ', playerId: ' p1 ' })).toEqual({
      sessionId: 'abc',
      playerId: 'p1',
    });
  });

  it.each([
    [null],
    [{ sessionId: 'abc' }],
    [{ playerId: 'p1' }],
    [{ sessionId: '', playerId: 'p1' }],
  ])('rejects malformed payload %#', (payload) => {
    expect(parseSessionLeaveRequest(payload)).toBeNull();
  });
});

describe('parsePlayerMoveRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    const result = parsePlayerMoveRequest({
      sessionId: ' abc ',
      playerId: ' p1 ',
      position: { x: 1, y: 1.7, z: -2 },
      rotationY: 3.14,
    });
    expect(result).toEqual({
      sessionId: 'abc',
      playerId: 'p1',
      position: { x: 1, y: 1.7, z: -2 },
      rotationY: 3.14,
    });
  });

  it.each([
    [null],
    [undefined],
    [{}],
    [{ sessionId: '', playerId: 'p1', position: { x: 0, y: 0, z: 0 }, rotationY: 0 }],
    [{ sessionId: 'abc', playerId: 'p1', position: { x: 0, y: 0 }, rotationY: 0 }],
    [{ sessionId: 'abc', playerId: 'p1', position: { x: 0, y: 0, z: 'nope' }, rotationY: 0 }],
    [{ sessionId: 'abc', playerId: 'p1', position: { x: 0, y: 0, z: 0 }, rotationY: 'nope' }],
    [{ sessionId: 'abc', playerId: 'p1', position: { x: 0, y: 0, z: 0 }, rotationY: NaN }],
    [{ sessionId: 'abc', playerId: 'p1', position: null, rotationY: 0 }],
  ])('rejects malformed payload %#', (payload) => {
    expect(parsePlayerMoveRequest(payload)).toBeNull();
  });
});

describe('parseSceneCreateRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    const result = parseSceneCreateRequest({
      sessionId: ' abc ',
      playerId: ' p1 ',
      sceneId: ' scene-1 ',
      name: ' Dungeon ',
      backgroundImage: 'https://example/dungeon.png',
    });
    expect(result).toEqual({
      sessionId: 'abc',
      playerId: 'p1',
      sceneId: 'scene-1',
      name: 'Dungeon',
      backgroundImage: 'https://example/dungeon.png',
    });
  });

  it('accepts an empty backgroundImage', () => {
    const result = parseSceneCreateRequest({
      sessionId: 'abc',
      playerId: 'p1',
      sceneId: 'scene-1',
      name: 'Dungeon',
      backgroundImage: '',
    });
    expect(result).not.toBeNull();
  });

  it.each([
    [null],
    [{}],
    [{ sessionId: 'abc', playerId: 'p1', sceneId: 's1', name: '', backgroundImage: '' }],
    [{ sessionId: 'abc', playerId: 'p1', sceneId: 's1', name: 'Dungeon' }], // missing backgroundImage
    [{ sessionId: 'abc', playerId: 'p1', name: 'Dungeon', backgroundImage: '' }], // missing sceneId
  ])('rejects malformed payload %#', (payload) => {
    expect(parseSceneCreateRequest(payload)).toBeNull();
  });
});

describe('parseSceneChangeRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    expect(
      parseSceneChangeRequest({ sessionId: ' abc ', playerId: ' p1 ', sceneId: ' s1 ' }),
    ).toEqual({ sessionId: 'abc', playerId: 'p1', sceneId: 's1' });
  });

  it.each([[null], [{ sessionId: 'abc', playerId: 'p1' }], [{ sceneId: 's1' }]])(
    'rejects malformed payload %#',
    (payload) => {
      expect(parseSceneChangeRequest(payload)).toBeNull();
    },
  );
});

describe('parseSceneUpdateRequest', () => {
  it('accepts a partial update (backgroundImage only)', () => {
    const result = parseSceneUpdateRequest({
      sessionId: 'abc',
      playerId: 'p1',
      sceneId: 's1',
      backgroundImage: 'https://example/map.png',
    });
    expect(result).toEqual({
      sessionId: 'abc',
      playerId: 'p1',
      sceneId: 's1',
      name: undefined,
      backgroundImage: 'https://example/map.png',
    });
  });

  it('accepts a partial update (name only)', () => {
    const result = parseSceneUpdateRequest({
      sessionId: 'abc',
      playerId: 'p1',
      sceneId: 's1',
      name: 'Renamed',
    });
    expect(result).not.toBeNull();
  });

  it.each([
    [null],
    [{ sessionId: 'abc', playerId: 'p1', sceneId: 's1' }], // nothing to update
    [{ sessionId: 'abc', playerId: 'p1', sceneId: 's1', name: 42 }],
  ])('rejects malformed payload %#', (payload) => {
    expect(parseSceneUpdateRequest(payload)).toBeNull();
  });
});

describe('parseDrawingStartRequest', () => {
  it('accepts a well-formed payload', () => {
    const result = parseDrawingStartRequest({
      sessionId: 'abc',
      playerId: 'p1',
      sceneId: 's1',
      drawingId: 'd1',
      point: { x: 1, y: 2 },
    });
    expect(result).toEqual({
      sessionId: 'abc',
      playerId: 'p1',
      sceneId: 's1',
      drawingId: 'd1',
      point: { x: 1, y: 2 },
    });
  });

  it.each([
    [null],
    [{ sessionId: 'abc', playerId: 'p1', sceneId: 's1', drawingId: 'd1' }], // missing point
    [{ sessionId: 'abc', playerId: 'p1', sceneId: 's1', drawingId: 'd1', point: { x: 1 } }],
  ])('rejects malformed payload %#', (payload) => {
    expect(parseDrawingStartRequest(payload)).toBeNull();
  });
});

describe('parseDrawingUpdateRequest', () => {
  it('accepts a well-formed payload', () => {
    const result = parseDrawingUpdateRequest({
      sessionId: 'abc',
      drawingId: 'd1',
      point: { x: 1, y: 2 },
    });
    expect(result).toEqual({ sessionId: 'abc', drawingId: 'd1', point: { x: 1, y: 2 } });
  });

  it.each([[null], [{ sessionId: 'abc', drawingId: 'd1' }]])(
    'rejects malformed payload %#',
    (payload) => {
      expect(parseDrawingUpdateRequest(payload)).toBeNull();
    },
  );
});

describe('parseDrawingEndRequest', () => {
  it('accepts a well-formed payload', () => {
    expect(parseDrawingEndRequest({ sessionId: 'abc', drawingId: 'd1' })).toEqual({
      sessionId: 'abc',
      drawingId: 'd1',
    });
  });

  it.each([[null], [{ sessionId: 'abc' }]])('rejects malformed payload %#', (payload) => {
    expect(parseDrawingEndRequest(payload)).toBeNull();
  });
});

describe('parseDrawingDeleteRequest', () => {
  it('accepts a well-formed payload', () => {
    expect(parseDrawingDeleteRequest({ sessionId: 'abc', sceneId: 's1', drawingId: 'd1' })).toEqual(
      { sessionId: 'abc', sceneId: 's1', drawingId: 'd1' },
    );
  });

  it.each([[null], [{ sessionId: 'abc', drawingId: 'd1' }]])(
    'rejects malformed payload %#',
    (payload) => {
      expect(parseDrawingDeleteRequest(payload)).toBeNull();
    },
  );
});

describe('parseDiceSpawnRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    const result = parseDiceSpawnRequest({
      sessionId: ' abc ',
      playerId: ' p1 ',
      diceId: ' d1 ',
      position: { x: 0.5, y: 0.8, z: -0.2 },
    });
    expect(result).toEqual({
      sessionId: 'abc',
      playerId: 'p1',
      diceId: 'd1',
      position: { x: 0.5, y: 0.8, z: -0.2 },
    });
  });

  it.each([
    [null],
    [{ sessionId: 'abc', playerId: 'p1', diceId: 'd1' }], // missing position
    [{ sessionId: 'abc', playerId: 'p1', diceId: 'd1', position: { x: 0, y: 0 } }],
    [{ sessionId: 'abc', playerId: 'p1', diceId: '', position: { x: 0, y: 0, z: 0 } }],
  ])('rejects malformed payload %#', (payload) => {
    expect(parseDiceSpawnRequest(payload)).toBeNull();
  });
});

describe('parseDiceRollRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    expect(parseDiceRollRequest({ sessionId: ' abc ', playerId: ' p1 ', diceId: ' d1 ' })).toEqual({
      sessionId: 'abc',
      playerId: 'p1',
      diceId: 'd1',
    });
  });

  it.each([[null], [{ sessionId: 'abc', playerId: 'p1' }], [{ diceId: 'd1' }]])(
    'rejects malformed payload %#',
    (payload) => {
      expect(parseDiceRollRequest(payload)).toBeNull();
    },
  );
});

describe('parseDiceRemoveRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    expect(
      parseDiceRemoveRequest({ sessionId: ' abc ', playerId: ' p1 ', diceId: ' d1 ' }),
    ).toEqual({ sessionId: 'abc', playerId: 'p1', diceId: 'd1' });
  });

  it.each([[null], [{ sessionId: 'abc', playerId: 'p1' }], [{ diceId: 'd1' }]])(
    'rejects malformed payload %#',
    (payload) => {
      expect(parseDiceRemoveRequest(payload)).toBeNull();
    },
  );
});

describe('parseSoundPlayRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    expect(
      parseSoundPlayRequest({ sessionId: ' abc ', playerId: ' p1 ', soundId: ' bell ' }),
    ).toEqual({ sessionId: 'abc', playerId: 'p1', soundId: 'bell' });
  });

  it.each([[null], [{ sessionId: 'abc', playerId: 'p1' }], [{ soundId: 'bell' }]])(
    'rejects malformed payload %#',
    (payload) => {
      expect(parseSoundPlayRequest(payload)).toBeNull();
    },
  );
});

describe('parsePlayerMuteRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    expect(
      parsePlayerMuteRequest({ sessionId: ' abc ', playerId: ' p1 ', targetPlayerId: ' p2 ' }),
    ).toEqual({ sessionId: 'abc', playerId: 'p1', targetPlayerId: 'p2' });
  });

  it.each([[null], [{ sessionId: 'abc', playerId: 'p1' }], [{ targetPlayerId: 'p2' }]])(
    'rejects malformed payload %#',
    (payload) => {
      expect(parsePlayerMuteRequest(payload)).toBeNull();
    },
  );
});

describe('parsePlayerUnmuteRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    expect(
      parsePlayerUnmuteRequest({ sessionId: ' abc ', playerId: ' p1 ', targetPlayerId: ' p2 ' }),
    ).toEqual({ sessionId: 'abc', playerId: 'p1', targetPlayerId: 'p2' });
  });

  it.each([[null], [{ sessionId: 'abc', playerId: 'p1' }], [{ targetPlayerId: 'p2' }]])(
    'rejects malformed payload %#',
    (payload) => {
      expect(parsePlayerUnmuteRequest(payload)).toBeNull();
    },
  );
});
