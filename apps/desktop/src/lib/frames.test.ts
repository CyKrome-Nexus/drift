import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYBACK, frameDue, frameInterval, qualityScale, readPlayback } from './frames';

describe('wallpaper frame rules', () => {
  it('caps the frame rate, and Unlimited draws every refresh', () => {
    expect(frameInterval('30')).toBeCloseTo(33.33, 1);
    expect(frameInterval('Unlimited')).toBe(0);
    expect(frameDue(0, 20, '30')).toBe(false);
    expect(frameDue(0, 34, '30')).toBe(true);
    // A 60 fps cap keeps up with a 60 Hz display despite timer jitter.
    expect(frameDue(0, 16.2, '60')).toBe(true);
    expect(frameDue(0, 4, 'Unlimited')).toBe(true);
  });

  it('renders Balanced at half the pixels and Low at a quarter', () => {
    expect(qualityScale('High')).toBe(1);
    expect(qualityScale('Balanced') ** 2).toBeCloseTo(0.5, 9);
    expect(qualityScale('Low') ** 2).toBe(0.25);
  });

  it('reads what the engine pushed, field by field', () => {
    expect(readPlayback(undefined)).toEqual(DEFAULT_PLAYBACK);
    expect(readPlayback({ paused: 'On battery power', fps: '30' })).toEqual({ paused: 'On battery power', fps: '30', quality: 'High' });
    expect(readPlayback({ paused: 3, fps: null })).toEqual(DEFAULT_PLAYBACK);
  });
});
