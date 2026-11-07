import { useEffect, useRef, useState } from 'react';
import type { Era, EraId } from '../rules/eras';
import { ERAS, getEra, techBasesLabel } from '../rules/eras';
import type { TechBase } from '../rules/types';
import type { ThemeChoice } from './theme';

interface Props {
  current: EraId;
  currentTechBase: TechBase;
  onSelect: (era: EraId, techBase: TechBase) => void;
  /** When provided the dialog can be dismissed without choosing (Esc / Cancel). */
  onCancel?: () => void;
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
}

const THEMES: { id: ThemeChoice; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: '☀' },
  { id: 'dark', label: 'Dark', icon: '☾' },
  { id: 'system', label: 'System', icon: '◐' },
];

const TECH_BASE_INFO: Record<TechBase, { name: string; blurb: string }> = {
  IS: {
    name: 'Inner Sphere',
    blurb: 'Recovered Star League technology: XL engines take 3 slots per side torso, Endo Steel and Ferro-Fibrous need 14 slots each.',
  },
  Clan: {
    name: 'Clan',
    blurb: 'Lighter, more compact and longer-ranged equipment: XL engines take 2 slots per side torso, Endo Steel and Ferro-Fibrous need 7.',
  },
};

/** Modal asking which tech level (and, where relevant, tech base) to build for. */
export function EraDialog({ current, currentTechBase, onSelect, onCancel, theme, onThemeChange }: Props) {
  const [pending, setPending] = useState<Era | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  // Start keyboard focus on the current era, or the first one that can be built.
  const focusId = ERAS.find((e) => e.id === current && e.available)?.id ?? ERAS.find((e) => e.available)?.id;

  useEffect(() => {
    firstRef.current?.focus();
  }, [pending]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pending) setPending(null);
      else onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);

  const pickEra = (era: Era) => {
    if (era.techBases.length === 1) onSelect(era.id, era.techBases[0]);
    else setPending(era);
  };

  return (
    <div className={`modal-backdrop ${onCancel ? '' : 'startup'}`}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="era-title">
        {!pending ? (
          <>
            <h2 id="era-title">Choose a tech level</h2>
            <p className="muted">Pick the era your BattleMech is built for. This sets which technology is available.</p>
            <div className="era-grid">
              {ERAS.map((era) => (
                <button
                  key={era.id}
                  ref={era.id === focusId ? firstRef : undefined}
                  className={`era-btn ${era.id === current ? 'current' : ''}`}
                  disabled={!era.available}
                  onClick={() => pickEra(era)}
                >
                  <span className="era-year">{era.year}</span>
                  <span className="era-name">{era.name}</span>
                  <span className="era-meta">{era.years} · {era.rulesLevel} · {techBasesLabel(era)}</span>
                  <span className="era-desc">{era.description}</span>
                  {!era.available && <span className="era-soon">Coming soon</span>}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 id="era-title">{pending.year} {pending.name}: choose a tech base</h2>
            <p className="muted">
              Inner Sphere and Clan equipment can only be combined with the Mixed tech option
              (Advanced rules), which you can switch on in the Chassis panel.
            </p>
            <div className="era-grid two">
              {pending.techBases.map((tb, i) => (
                <button
                  key={tb}
                  ref={(tb === currentTechBase || (i === 0 && !pending.techBases.includes(currentTechBase))) ? firstRef : undefined}
                  className={`era-btn ${getEra(current)?.id === pending.id && tb === currentTechBase ? 'current' : ''}`}
                  onClick={() => onSelect(pending.id, tb)}
                >
                  <span className="era-year">{TECH_BASE_INFO[tb].name}</span>
                  <span className="era-desc">{TECH_BASE_INFO[tb].blurb}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="row wrap" style={{ marginTop: '1rem' }}>
          <span className="muted small">Theme</span>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.id} role="radio" aria-checked={theme === t.id}
                className={theme === t.id ? 'active' : ''} onClick={() => onThemeChange(t.id)}>
                <span aria-hidden="true">{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
          <span className="spacer" />
          {pending && <button onClick={() => setPending(null)}>Back</button>}
          {onCancel && <button onClick={onCancel}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}
