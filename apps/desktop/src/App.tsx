import { useEffect } from 'react';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { TrafficLights } from './components/TrafficLights';
import { UpgradeDialog } from './components/UpgradeDialog';
import { restoreSession } from './lib/account';
import { connectEngine } from './lib/actions';
import { syncSystemSettings } from './lib/platform';
import { getState, useApp } from './lib/store';
import { checkForUpdates, downloadAndInstall } from './lib/updater';
import { Browse } from './screens/Browse';
import { Detail } from './screens/Detail';
import { Home } from './screens/Home';
import { Settings } from './settings/Settings';

/** Let the window settle before touching the network, as Aperture does. */
const STARTUP_UPDATE_DELAY_MS = 4000;

export function App() {
  const view = useApp((s) => s.view);

  useEffect(() => {
    let disconnect: (() => void) | undefined;
    let cancelled = false;
    void restoreSession().then(async () => {
      const off = await connectEngine();
      if (cancelled) off();
      else disconnect = off;
    });
    const { mode, checkOnStartup } = getState().updatePrefs;
    if (mode === 'manual' || !checkOnStartup) return () => { cancelled = true; disconnect?.(); };
    const t = setTimeout(async () => {
      await checkForUpdates(false);
      if (getState().updatePrefs.mode === 'auto') await downloadAndInstall();
    }, STARTUP_UPDATE_DELAY_MS);
    return () => {
      cancelled = true;
      disconnect?.();
      clearTimeout(t);
    };
  }, []);

  const launchAtLogin = useApp((s) => s.settings.launchAtLogin);
  const showInTray = useApp((s) => s.settings.showInTray);
  useEffect(() => {
    syncSystemSettings({ launchAtLogin, showInTray }).catch((err) => console.warn('[system] could not apply settings', err));
  }, [launchAtLogin, showInTray]);

  // Home and Browse stay mounted under the full-window overlays, so closing one returns to the
  // same scroll position.
  const base = view.name === 'detail' || view.name === 'settings' ? view.back : view;

  return (
    <div className="window">
      {base.name === 'browse' ? <Browse tab={base.tab} /> : <Home />}
      <TopBar />
      {view.name === 'detail' && <Detail id={view.id} />}
      {view.name === 'settings' && <Settings section={view.section} />}
      <TrafficLights />
      <UpgradeDialog />
      <Toast />
    </div>
  );
}
