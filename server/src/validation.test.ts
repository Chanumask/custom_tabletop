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
  parsePlayerUpdateRequest,
  parseSessionPeekRequest,
} from './validation.js';

describe('parseSessionJoinRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    const result = parseSessionJoinRequest({
      sessionId: ' abc ',
      playerId: ' p1 ',
      playerName: ' Alice ',
      playerToken: 'secret',
    });
    expect(result).toEqual({
      sessionId: 'abc',
      playerId: 'p1',
      playerName: 'Alice',
      playerToken: 'secret',
    });
  });

  it.each([
    [null],
    [undefined],
    ['a string'],
    [42],
    [{}],
    [{ sessionId: 'abc', playerId: 'p1', playerName: '', playerToken: 't' }],
    [{ sessionId: '   ', playerId: 'p1', playerName: 'Alice', playerToken: 't' }],
    [{ sessionId: 'abc', playerId: 123, playerName: 'Alice', playerToken: 't' }],
    [{ sessionId: 'abc', playerName: 'Alice', playerToken: 't' }],
    [{ sessionId: 'abc', playerId: 'p1', playerName: 'Alice' }],
    [{ sessionId: 'abc', playerId: 'p1', playerName: 'Alice', playerToken: '' }],
    [{ sessionId: 'abc', playerId: 'p1', playerName: 'Alice', playerToken: 'x'.repeat(201) }],
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
      color: '#241a12',
      width: 5,
    });
    expect(result).toEqual({
      sessionId: 'abc',
      playerId: 'p1',
      sceneId: 's1',
      drawingId: 'd1',
      point: { x: 1, y: 2 },
      color: '#241a12',
      width: 5,
    });
  });

  it.each([
    [null],
    [{ sessionId: 'abc', playerId: 'p1', sceneId: 's1', drawingId: 'd1' }], // missing point/color/width
    [
      {
        sessionId: 'abc',
        playerId: 'p1',
        sceneId: 's1',
        drawingId: 'd1',
        point: { x: 1 },
        color: '#241a12',
        width: 5,
      },
    ],
    [
      // width out of bounds
      {
        sessionId: 'abc',
        playerId: 'p1',
        sceneId: 's1',
        drawingId: 'd1',
        point: { x: 1, y: 2 },
        color: '#241a12',
        width: 999,
      },
    ],
    [
      // missing color
      {
        sessionId: 'abc',
        playerId: 'p1',
        sceneId: 's1',
        drawingId: 'd1',
        point: { x: 1, y: 2 },
        width: 5,
      },
    ],
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
      kind: 'd6', // the default when none is given
    });
  });

  it('accepts every die kind', () => {
    for (const kind of ['d4', 'd6', 'd8', 'd10', 'd12', 'd20']) {
      expect(
        parseDiceSpawnRequest({
          sessionId: 'abc',
          playerId: 'p1',
          diceId: 'd1',
          position: { x: 0, y: 0, z: 0 },
          kind,
        })?.kind,
      ).toBe(kind);
    }
  });

  it.each([
    [null],
    [{ sessionId: 'abc', playerId: 'p1', diceId: 'd1' }], // missing position
    [
      {
        sessionId: 'abc',
        playerId: 'p1',
        diceId: 'd1',
        position: { x: 0, y: 0, z: 0 },
        kind: 'd7',
      },
    ],
    [{ sessionId: 'abc', playerId: 'p1', diceId: 'd1', position: { x: 0, y: 0 } }],
    [{ sessionId: 'abc', playerId: 'p1', diceId: '', position: { x: 0, y: 0, z: 0 } }],
  ])('rejects malformed payload %#', (payload) => {
    expect(parseDiceSpawnRequest(payload)).toBeNull();
  });
});

describe('parseDiceRollRequest', () => {
  it('accepts a well-formed payload and trims whitespace', () => {
    expect(
      parseDiceRollRequest({ sessionId: ' abc ', playerId: ' p1 ', diceIds: [' d1 ', 'd2'] }),
    ).toEqual({
      sessionId: 'abc',
      playerId: 'p1',
      diceIds: ['d1', 'd2'],
    });
  });

  it.each([
    [null],
    [{ sessionId: 'abc', playerId: 'p1' }],
    [{ diceIds: ['d1'] }],
    [{ sessionId: 'abc', playerId: 'p1', diceIds: [] }],
    [{ sessionId: 'abc', playerId: 'p1', diceIds: ['d1', ''] }],
    [{ sessionId: 'abc', playerId: 'p1', diceIds: Array.from({ length: 21 }, (_, i) => `d${i}`) }],
    [{ sessionId: 'abc', playerId: 'p1', diceId: 'd1' }], // the old single-id shape
  ])('rejects malformed payload %#', (payload) => {
    expect(parseDiceRollRequest(payload)).toBeNull();
  });
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

describe('session:join color and name limits', () => {
  const base = { sessionId: 'abc', playerId: 'p1', playerName: 'Alice', playerToken: 't' };

  it('accepts a valid preferred color', () => {
    expect(parseSessionJoinRequest({ ...base, color: 'green' })?.color).toBe('green');
  });

  it.each([[{ ...base, color: 'magenta' }], [{ ...base, playerName: 'x'.repeat(25) }]])(
    'rejects %o',
    (payload) => {
      expect(parseSessionJoinRequest(payload)).toBeNull();
    },
  );
});

describe('parseSessionPeekRequest', () => {
  it('accepts a session id', () => {
    expect(parseSessionPeekRequest({ sessionId: ' abc ' })).toEqual({ sessionId: 'abc' });
  });

  it.each([[null], [{}], [{ sessionId: '' }]])('rejects malformed payload %#', (payload) => {
    expect(parseSessionPeekRequest(payload)).toBeNull();
  });
});

describe('parsePlayerUpdateRequest', () => {
  it('accepts a name and/or a color', () => {
    expect(parsePlayerUpdateRequest({ sessionId: 'a', playerId: 'p', name: ' Bo ' })).toEqual({
      sessionId: 'a',
      playerId: 'p',
      name: 'Bo',
    });
    expect(parsePlayerUpdateRequest({ sessionId: 'a', playerId: 'p', color: 'red' })).toEqual({
      sessionId: 'a',
      playerId: 'p',
      color: 'red',
    });
  });

  it.each([
    [{ sessionId: 'a', playerId: 'p' }],
    [{ sessionId: 'a', playerId: 'p', name: '   ' }],
    [{ sessionId: 'a', playerId: 'p', name: 'x'.repeat(25) }],
    [{ sessionId: 'a', playerId: 'p', color: 'teal' }],
  ])('rejects malformed payload %#', (payload) => {
    expect(parsePlayerUpdateRequest(payload)).toBeNull();
  });
});
