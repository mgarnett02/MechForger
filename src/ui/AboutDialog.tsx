import { useEffect } from 'react';
import { DISCLAIMER, DISCLAIMER_TITLE } from './legal';

/** About / Legal window with the full disclaimer. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal about" role="dialog" aria-modal="true" aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}>
        <h2 id="about-title">MechForger</h2>
        <p className="muted">A free BattleMech and combat vehicle designer.</p>
        <h3>{DISCLAIMER_TITLE}</h3>
        {DISCLAIMER.map((p, i) => <p key={i}>{p}</p>)}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="primary" onClick={onClose} autoFocus>Close</button>
        </div>
      </div>
    </div>
  );
}
