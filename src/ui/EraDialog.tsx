import { useEffect, useRef, useState } from 'react';
import type { Era, EraId } from '../rules/eras';
import { ERAS, getEra, techBasesLabel } from '../rules/eras';
import type { TechBase } from '../rules/types';
import type { ThemeChoice } from './theme';
import { DISCLAIMER_SHORT } from './legal';

interface Props {
  current: EraId;
  currentTechBase: TechBase;
  onSelect: (era: EraId, techBase: TechBase, unit: 'mech' | 'vehicle' | 'support' | 'fighter' | 'vessel' | 'battlearmor' | 'infantry') => void;
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
  // Steps: pick an era → pick mech or vehicle → (if the era offers both) pick a tech base.
  const [step, setStep] = useState<'era' | 'unit' | 'techbase'>('era');
  const back = () => {
    if (step === 'techbase') setStep('unit');
    else {
      setStep('era');
      setPending(null);
    }
  };
  const firstRef = useRef<HTMLButtonElement>(null);
  // Start keyboard focus on the current era, or the first one that can be built.
  const focusId = ERAS.find((e) => e.id === current && e.available)?.id ?? ERAS.find((e) => e.available)?.id;

  useEffect(() => {
    firstRef.current?.focus();
  }, [pending, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (step !== 'era') back();
      else onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, step]);

  const pickEra = (era: Era) => {
    setPending(era);
    setStep('unit');
  };
  const [unit, setUnit] = useState<'mech' | 'vehicle' | 'support' | 'fighter' | 'vessel' | 'battlearmor' | 'infantry'>('mech');
  const pickUnit = (u: 'mech' | 'vehicle' | 'support' | 'fighter' | 'vessel' | 'battlearmor' | 'infantry') => {
    if (!pending) return;
    setUnit(u);
    if (pending.techBases.length === 1) onSelect(pending.id, pending.techBases[0], u);
    else setStep('techbase');
  };

  return (
    <div className={`modal-backdrop ${onCancel ? '' : 'startup'}`}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="era-title">
        {step === 'unit' && pending ? (
          <>
            <h2 id="era-title">{pending.year} {pending.name}: what are you building?</h2>
            <p className="muted">All use the {pending.name} era&apos;s technology.</p>
            <div className="era-grid">
              <button ref={firstRef} className="era-btn" onClick={() => pickUnit('mech')}>
                <span className="unit-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" width="40" height="40"><path d="M18 6h12v8h6v14h-4v14h-6V30h-4v12h-6V28h-4V14h6z" fill="currentColor" /></svg>
                </span>
                <span className="era-year">BattleMech</span>
                <span className="era-desc">A walking war machine: tonnage, engine, armor, weapons and critical slots.</span>
              </button>
              <button className="era-btn" onClick={() => pickUnit('vehicle')}>
                <span className="unit-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" width="40" height="40"><path d="M10 20h18l4-6h8v6h4v10H4V24zM8 32h32v6H8z" fill="currentColor" /></svg>
                </span>
                <span className="era-year">Combat Vehicle</span>
                <span className="era-desc">Tracked, wheeled, hover, VTOL and naval vehicles.</span>
              </button>
              <button className="era-btn" onClick={() => pickUnit('support')}>
                <span className="unit-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" width="40" height="40"><path d="M4 16h26v16H4zM30 22h8l6 6v4H30zM8 34a4 4 0 1 0 8 0 4 4 0 1 0-8 0M32 34a4 4 0 1 0 8 0 4 4 0 1 0-8 0" fill="currentColor" /></svg>
                </span>
                <span className="era-year">Support Vehicle</span>
                <span className="era-desc">Trucks, transports, trains, airships and aircraft built with support vehicle rules.</span>
              </button>
              <button className="era-btn" onClick={() => pickUnit('fighter')}>
                <span className="unit-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" width="40" height="40"><path d="M24 2l4 14 16 10v4l-16-4-2 12 6 4v3l-8-2-8 2v-3l6-4-2-12-16 4v-4l16-10z" fill="currentColor" /></svg>
                </span>
                <span className="era-year">Fighter</span>
                <span className="era-desc">Aerospace fighters (incl. OmniFighters) and conventional fighters.</span>
              </button>
              <button className="era-btn" onClick={() => pickUnit('vessel')}>
                <span className="unit-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" width="40" height="40"><path d="M24 3c8 0 14 9 14 20v12l5 8H5l5-8V23C10 12 16 3 24 3zm0 9a5 5 0 1 0 0 10 5 5 0 1 0 0-10z" fill="currentColor" /></svg>
                </span>
                <span className="era-year">Spacecraft</span>
                <span className="era-desc">Small craft, DropShips, JumpShips, WarShips and space stations, with weapon bays, transport bays and crew.</span>
              </button>
              <button className="era-btn" onClick={() => pickUnit('battlearmor')}>
                <span className="unit-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" width="40" height="40"><path d="M19 4h10v8h-10zM15 14h18l4 14h-5l-2-7v23h-6V30h-2v14h-6V21l-2 7h-5z" fill="currentColor" /></svg>
                </span>
                <span className="era-year">Battle Armor</span>
                <span className="era-desc">Powered armor squads: weight class, manipulators, jump/VTOL/UMU, weapons and anti-personnel mounts.</span>
              </button>
              <button className="era-btn" onClick={() => pickUnit('infantry')}>
                <span className="unit-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" width="40" height="40"><path d="M10 8a4 4 0 1 0 8 0 4 4 0 1 0-8 0M30 8a4 4 0 1 0 8 0 4 4 0 1 0-8 0M8 14h12v14h-2v14h-3V30h-2v12h-3V28H8zM28 14h12v14h-2v14h-3V30h-2v12h-3V28h-2z" fill="currentColor" /></svg>
                </span>
                <span className="era-year">Infantry</span>
                <span className="era-desc">Conventional platoons: foot, jump, motorized, mechanized and beast-mounted, with weapons, armor kits and field guns.</span>
              </button>
            </div>
          </>
        ) : step === 'era' || !pending ? (
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
                  onClick={() => onSelect(pending.id, tb, unit)}
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
          {step !== 'era' && <button onClick={back}>Back</button>}
          {onCancel && <button onClick={onCancel}>Cancel</button>}
        </div>
        <p className="legal-note">{DISCLAIMER_SHORT} Free, non-commercial, made under the Microsoft Game Content Usage Rules.</p>
      </div>
    </div>
  );
}
