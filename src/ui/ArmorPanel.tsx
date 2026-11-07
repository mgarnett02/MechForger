import { useEffect, useState } from 'react';
import type { MechDesign } from '../rules/types';
import { LOCATIONS, LOCATION_NAMES, REAR_FACING } from '../rules/types';
import type { MechSummary } from '../rules/construction';
import { locationArmor } from '../rules/armor';
import { clearArmor, maximizeArmor, setArmor, setArmorTonnage } from '../rules/edit';
import { NumberField } from './NumberField';

interface Props {
  design: MechDesign;
  summary: MechSummary;
  update: (fn: (d: MechDesign) => MechDesign) => void;
}

export function ArmorPanel({ design, summary, update }: Props) {
  const [tons, setTons] = useState(summary.weights.armor);
  useEffect(() => setTons(summary.weights.armor), [summary.weights.armor]);
  const maxTons = Math.ceil((summary.armorMaxTotal / 16) * 2) / 2;
  return (
    <section className="panel">
      <h2>Armor <span className="muted small">Standard · 16 pts/ton</span></h2>
      <table className="armor-table">
        <thead>
          <tr><th>Location</th><th>IS</th><th>Front</th><th>Rear</th><th>Max</th></tr>
        </thead>
        <tbody>
          {LOCATIONS.map((loc) => {
            const rear = REAR_FACING[loc];
            const total = locationArmor(design.armor, loc);
            const max = summary.armorMax[loc];
            const over = total > max;
            return (
              <tr key={loc}>
                <td>{LOCATION_NAMES[loc]}</td>
                <td className="num muted">{summary.structure?.[loc] ?? '—'}</td>
                <td>
                  <NumberField label={`${LOCATION_NAMES[loc]} armor`} value={design.armor[loc]} min={0}
                    max={max} width="3.5rem" invalid={over}
                    onChange={(n) => update((d) => setArmor(d, loc, n))} />
                </td>
                <td>
                  {rear && (
                    <NumberField label={`${LOCATION_NAMES[loc]} rear armor`} value={design.armor[rear]} min={0}
                      max={max} width="3.5rem" invalid={over}
                      onChange={(n) => update((d) => setArmor(d, rear, n))} />
                  )}
                </td>
                <td className={`num ${over ? 'bad' : 'muted'}`}>{max}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td><td />
            <td colSpan={2} className="num">{summary.armorTotal} pts</td>
            <td className="num muted">{summary.armorMaxTotal}</td>
          </tr>
        </tfoot>
      </table>
      <p className="muted small">
        {summary.weights.armor} tons
        {summary.armorTotal % 8 !== 0 && summary.armorTotal > 0 &&
          ` (${summary.weights.armor * 16 - summary.armorTotal} points paid for but unused)`}
      </p>
      <div className="row">
        <button onClick={() => update(maximizeArmor)}>Maximize</button>
        <button onClick={() => update(clearArmor)}>Clear</button>
        <span className="spacer" />
        <NumberField label="Armor tons" value={tons} min={0} max={maxTons} step={0.5} onChange={setTons} />
        <button onClick={() => update((d) => setArmorTonnage(d, tons))}>Distribute tons</button>
      </div>
    </section>
  );
}
