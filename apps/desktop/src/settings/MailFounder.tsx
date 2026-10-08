import { useState } from 'react';
import { PaperPlaneTilt } from '@phosphor-icons/react';
import { PUBLISHER } from '@drift/core';
import { APP_VERSION, openExternal } from '../lib/platform';
import { useApp } from '../lib/store';

/** Composes a note in the user's mail app, prefilled with who they are and which build they run. */
export function MailFounder({ platform, onClose }: { platform: string; onClose: () => void }) {
  const user = useApp((s) => s.account.user);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const send = () => {
    const body = [message.trim(), '', '—', `Drift ${APP_VERSION} · ${platform}`, ...(user ? [`CyKrome Account: ${user.email}`] : [])].join('\n');
    const url = `mailto:${PUBLISHER.founderEmail}?subject=${encodeURIComponent(subject.trim() || 'Drift — a note')}&body=${encodeURIComponent(body)}`;
    void openExternal(url);
    onClose();
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="mail-title">
        <div className="dialog-title" id="mail-title">Mail to Founder</div>
        <p className="dialog-body" style={{ margin: 0 }}>Tell us what Drift should do next — it lands in the founder’s inbox.</p>
        <div className="field">
          <label htmlFor="mail-subject">Subject</label>
          <input id="mail-subject" className="input" autoFocus value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Drift — a note" />
        </div>
        <div className="field">
          <label htmlFor="mail-body">Message</label>
          <textarea id="mail-body" className="input" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} style={{ resize: 'vertical' }} />
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!message.trim()} onClick={send}><PaperPlaneTilt />Open in Mail</button>
        </div>
      </div>
    </div>
  );
}
