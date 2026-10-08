import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PREVIEW_LOOP_MS, catalog } from '@drift/core';
import { Art } from './Art';

const w = catalog()[0];

describe('Art', () => {
  afterEach(() => vi.useRealTimers());

  it('starts a preview from the top of the loop', () => {
    const html = renderToStaticMarkup(<Art w={w} />);
    expect(html).not.toContain('animation-delay');
  });

  it('joins a running wallpaper at the same point in its loop', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    // Started 2.5 loops ago: half way through the current loop.
    const startedAtMs = 1_000_000 - PREVIEW_LOOP_MS * 2.5;
    const html = renderToStaticMarkup(<Art w={w} startedAtMs={startedAtMs} />);
    expect(html).toContain(`animation-delay:0s, -${PREVIEW_LOOP_MS / 2}ms`);
  });

  it('can be paused or still', () => {
    expect(renderToStaticMarkup(<Art w={w} paused />)).toContain('is-paused');
    expect(renderToStaticMarkup(<Art w={w} still />)).not.toContain('is-moving');
  });
});
