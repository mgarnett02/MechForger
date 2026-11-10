import { useEffect, useState } from 'react';
import type { MechDesign } from '../../rules/types';
import { configurationDesigns } from '../../rules/omni';
import type { VehicleDesign } from '../../rules/vehicle';
import { isVehicle } from '../../rules/vehicle';
import type { SupportVehicleDesign } from '../../rules/support';
import { isSupport } from '../../rules/support';
import { FighterRecordSheet, MechRecordSheet, SupportRecordSheet, VehicleRecordSheet } from './RecordSheets';
import type { FighterDesign } from '../../rules/fighter';
import { isFighter } from '../../rules/fighter';

interface Props {
  design: MechDesign | VehicleDesign | SupportVehicleDesign | FighterDesign;
  onClose: () => void;
}

type Paper = 'letter' | 'a4';

/** Full-screen preview of the record sheet(s), printed with the browser / app print dialog. */
export function PrintPreview({ design, onClose }: Props) {
  const isMech = !isVehicle(design) && !isSupport(design) && !isFighter(design);
  const mech = isMech ? (design as MechDesign) : null;
  const [allConfigs, setAllConfigs] = useState(false);
  const [paper, setPaper] = useState<Paper>(() => (navigator.language === 'en-US' ? 'letter' : 'a4'));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Paper size has to be set on @page, which only a stylesheet can do.
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `@page { size: ${paper === 'a4' ? 'A4' : 'letter'} portrait; margin: 8mm; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [paper]);

  const mechs: MechDesign[] = mech
    ? mech.omni && allConfigs
      ? configurationDesigns(mech).map((c) => c.design)
      : [mech]
    : [];

  return (
    <div className="print-overlay" role="dialog" aria-modal="true" aria-label="Print record sheet">
      <div className="print-controls">
        <strong>Record sheet</strong>
        {mech?.omni && (
          <label className="check">
            <input type="checkbox" checked={allConfigs} onChange={(e) => setAllConfigs(e.target.checked)} />
            All {mech.omni.configurations.length} configurations
          </label>
        )}
        <label className="check">
          Paper{' '}
          <select aria-label="Paper size" value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
            <option value="letter">US Letter</option>
            <option value="a4">A4</option>
          </select>
        </label>
        <span className="spacer" />
        <span className="muted small">Choose “Save as PDF” in the print dialog for a PDF.</span>
        <button className="primary" onClick={() => window.print()}>Print…</button>
        <button onClick={onClose}>Close</button>
      </div>
      <div className={`print-pages paper-${paper}`}>
        {isMech
          ? mechs.map((m, i) => <MechRecordSheet key={i} design={m} />)
          : isFighter(design) ? <FighterRecordSheet design={design} />
          : isSupport(design) ? <SupportRecordSheet design={design} />
          : <VehicleRecordSheet design={design as VehicleDesign} />}
      </div>
    </div>
  );
}
