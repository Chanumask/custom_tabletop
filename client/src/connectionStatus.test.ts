import { describe, expect, it } from 'vitest';
import { connectionStatusLabel } from './connectionStatus.js';

describe('connectionStatusLabel', () => {
  it('describes each connection status', () => {
    expect(connectionStatusLabel('connecting')).toBe('Connecting to server…');
    expect(connectionStatusLabel('connected')).toBe('Connected to server');
    expect(connectionStatusLabel('disconnected')).toBe('Disconnected from server');
  });
});
