import { ArrowRight } from '@phosphor-icons/react';
import { finishOnboarding, useKeys } from '../lib/catalog';
import { Sources } from './Sources';

/**
 * First launch: Drift's wallpapers come from Pexels and Pixabay through the person's own free
 * keys. They can add one or both, or skip and browse Drift's own generated loops until they do
 * (Settings › Wallpaper sources, any time).
 */
export function Welcome({ onDone }: { onDone: () => void }) {
  const keys = useKeys();
  const any = Object.values(keys).some(Boolean);
  const done = () => {
    finishOnboarding();
    onDone();
  };
  return (
    <div className="welcome">
      <div className="welcome-col">
        <span className="eyebrow">Welcome to Drift</span>
        <h1 className="welcome-title">Bring your own wallpapers</h1>
        <p className="welcome-lead">
          Drift plays thousands of free videos from Pexels and Pixabay as live wallpapers. To use them, connect your own free API
          key for each: it takes a minute, costs nothing, and keeps your browsing yours.
        </p>
        <Sources />
        <div className="welcome-actions">
          <button type="button" className="btn btn-ghost" onClick={done}>Skip for now</button>
          <button type="button" className="btn btn-primary" disabled={!any} onClick={done}>
            Start browsing<ArrowRight />
          </button>
        </div>
        <span className="srow-desc" style={{ textAlign: 'right' }}>
          Skipping shows Drift’s own generated loops. Add keys any time in Settings › Wallpaper sources.
        </span>
      </div>
    </div>
  );
}
