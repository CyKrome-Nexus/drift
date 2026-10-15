import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PREVIEW_LOOP_MS, generatedWallpapers, type Wallpaper } from '@drift/core';
import { Art } from './Art';

const w = generatedWallpapers()[0];
const video: Wallpaper = {
  ...w,
  id: 'nasa:x',
  media: { kind: 'video', poster: 'https://p/poster.jpg', thumbnail: 'https://p/thumb.jpg', preview: 'https://p/preview.mp4', files: [{ url: 'https://p/large.mp4', width: 1920, height: 1080, type: 'video/mp4' }], durationMs: 30_000 },
};

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

  it('plays a provider’s video over its poster, and shows a still in cards', () => {
    const moving = renderToStaticMarkup(<Art w={video} />);
    expect(moving).toContain('<video');
    expect(moving).toContain('src="https://p/large.mp4"');
    expect(moving).toContain('poster="https://p/poster.jpg"');
    const still = renderToStaticMarkup(<Art w={video} still />);
    expect(still).not.toContain('<video');
    expect(still).toContain('src="https://p/thumb.jpg"');
  });
});
