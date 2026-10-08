import { Minus, X } from '@phosphor-icons/react';
import { color } from '@drift/tokens';
import { windowControls } from '../lib/platform';

/** The window is borderless and fixed in place; these float top-centre over the content, as in the design. */
export function TrafficLights() {
  return (
    <div className="lights">
      <button type="button" className="light" style={{ background: color.traffic.close }} aria-label="Close" onClick={() => void windowControls.close()}>
        <X size={7} weight="bold" color="rgba(60,0,0,.7)" />
      </button>
      <button type="button" className="light" style={{ background: color.traffic.minimize }} aria-label="Minimize" onClick={() => void windowControls.minimize()}>
        <Minus size={7} weight="bold" color="rgba(90,50,0,.7)" />
      </button>
      {/* The window has a fixed size, so zoom is shown inactive, as macOS does for non-resizable windows. */}
      <span className="light is-disabled" style={{ background: color.neutral[700] }} aria-hidden="true" />
    </div>
  );
}
