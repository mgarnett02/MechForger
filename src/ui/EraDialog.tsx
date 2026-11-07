import { useEffect, useRef } from 'react';
import type { EraId } from '../rules/eras';
import { ERAS } from '../rules/eras';

interface Props {
  current: EraId;
  onSelect: (era: EraId) => void;
  /** When provided the dialog can be dismissed without choosing (Esc / Cancel). */
  onCancel?: () => void;
}

/** Modal asking which tech level to build for; shown before the main form. */
export function EraDialog({ current, onSelect, onCancel }: Props) {
  const firstRef = useRef<HTMLButtonElement>(null);
  // Start keyboard focus on the current era, or the first one that can be built.
  const focusId = ERAS.find((e) => e.id === current && e.available)?.id ?? ERAS.find((e) => e.available)?.id;

  useEffect(() => {
    firstRef.current?.focus();
    if (!onCancel) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className={`modal-backdrop ${onCancel ? '' : 'startup'}`}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="era-title">
        <h2 id="era-title">Choose a tech level</h2>
        <p className="muted">Pick the era your BattleMech is built for. This sets which technology is available.</p>
        <div className="era-grid">
          {ERAS.map((era) => (
            <button
              key={era.id}
              ref={era.id === focusId ? firstRef : undefined}
              className={`era-btn ${era.id === current ? 'current' : ''}`}
              disabled={!era.available}
              onClick={() => onSelect(era.id)}
            >
              <span className="era-year">{era.year}</span>
              <span className="era-name">{era.name}</span>
              <span className="era-meta">{era.years} · {era.rulesLevel} · {era.techBase}</span>
              <span className="era-desc">{era.description}</span>
              {!era.available && <span className="era-soon">Coming soon</span>}
            </button>
          ))}
        </div>
        {onCancel && (
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button onClick={onCancel}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
