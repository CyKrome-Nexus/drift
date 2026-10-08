import { useEffect, useRef } from 'react';
import { GearSix, MagnifyingGlass } from '@phosphor-icons/react';
import { initials } from '@drift/account';
import { go, openSettings, setState, useApp, type BrowseTab } from '../lib/store';

const TABS: Array<'Home' | BrowseTab> = ['Home', 'Discover', 'Library', 'Favourites'];

export function TopBar() {
  const view = useApp((s) => s.view);
  const query = useApp((s) => s.query);
  const user = useApp((s) => s.account.user);
  const input = useRef<HTMLInputElement>(null);
  const active = view.name === 'home' ? 'Home' : view.name === 'browse' ? view.tab : null;
  const isMac = navigator.userAgent.includes('Mac');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" />
        <span className="brand-name">Drift</span>
      </div>
      <nav className="topnav">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-current={active === t ? 'page' : undefined}
            onClick={() => {
              setState({ query: '' });
              go(t === 'Home' ? { name: 'home' } : { name: 'browse', tab: t });
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="topbar-right">
        <label className="search">
          <MagnifyingGlass size={14} />
          <input
            ref={input}
            value={query}
            placeholder="Search wallpapers, creators"
            onChange={(e) => {
              const q = e.target.value;
              setState({ query: q });
              if (q && view.name !== 'browse') go({ name: 'browse', tab: 'Discover' });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setState({ query: '' });
                e.currentTarget.blur();
              }
            }}
          />
          <span className="kbd">{isMac ? '⌘K' : 'Ctrl K'}</span>
        </label>
        <button type="button" className="icon-btn" aria-label="Settings" onClick={() => openSettings('General')}>
          <GearSix size={18} />
        </button>
        <button
          type="button"
          className={`avatar${user ? '' : ' is-guest'}`}
          aria-label={user ? 'Your CyKrome Account' : 'Sign in'}
          title={user ? user.email : 'Sign in with CyKrome'}
          onClick={() => openSettings('Account')}
        >
          {user ? initials(user) : '?'}
        </button>
      </div>
    </header>
  );
}
