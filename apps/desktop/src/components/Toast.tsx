import { CheckCircle, Info } from '@phosphor-icons/react';
import { useApp } from '../lib/store';

export function Toast() {
  const t = useApp((s) => s.toast);
  if (!t) return null;
  const Icon = t.tone === 'ok' ? CheckCircle : Info;
  return (
    <div key={t.id} className="toast" role="status">
      <Icon size={16} weight="fill" color="var(--color-accent)" />
      {t.text}
    </div>
  );
}
