import { useEffect, useState } from 'react';
import type { ArmorType, MechDesign } from '../rules/types';
import { ARMOR_NAMES, ARMOR_OPTIONS, armorSlots, componentAvailable, patchworkSlots } from '../rules/tables';

const ARMOR_NOTES: Partial<Record<ArmorType, string>> = {
  stealth: ' — needs ECM', hardened: ' — −1 running MP',
};
import { LOCATIONS, armorTypeAt, isPatchwork, locationName, REAR_FACING, techOf } from '../rules/types';
import { TechPicker } from './TechPicker';
import type { MechSummary } from '../rules/construction';
import { armorPointsForTons, armorTonnage, locationArmor } from '../rules/armor';
import { clearArmor, clearPatchwork, maximizeArmor, setArmor, setArmorTonnage, setArmorType, setLocationArmorType } from '../rules/edit';
import { NumberField } from './NumberField';

interface Props {
  design: MechDesign;
  summary: MechSummary;
  update: (fn: (d: MechDesign) => MechDesign) => void;
}

export function ArmorPanel({ design, summary, update }: Props) {
  const [tons, setTons] = useState(summary.weights.armor);
  const [patch, setPatch] = useState(isPatchwork(design));
  useEffect(() => { if (isPatchwork(design)) setPatch(true); }, [design]);
  const NO_PATCHWORK = ['commercial', 'industrial', 'heavy-industrial', 'primitive'];
  const patchOptions = (Object.keys(ARMOR_OPTIONS) as ArmorType[]).filter((k) => !NO_PATCHWORK.includes(k)
    && (k === 'standard' || componentAvailable(ARMOR_OPTIONS[k], design.era, techOf(design, 'armor'), design.mixedTech)));
  useEffect(() => setTons(summary.weights.armor), [summary.weights.armor]);
  const ppt = summary.armorPointsPerTon;
  const maxTons = armorTonnage(summary.armorMaxTotal, ppt);
  const unused = armorPointsForTons(summary.weights.armor, ppt) - summary.armorTotal;
  const pptLabel = Number.isInteger(ppt) ? String(ppt) : ppt.toFixed(2);
  return (
    <section className="panel">
      <h2>
        Armor{' '}
        <select aria-label="Armor type" value={design.armorType}
          onChange={(e) => update((d) => setArmorType(d, e.target.value as ArmorType))}>
          {(Object.keys(ARMOR_OPTIONS) as ArmorType[]).map((k) => {
            const n = k === 'stealth' ? 12 : armorSlots(k, techOf(design, 'armor'));
            return (
              <option key={k} value={k} disabled={k !== 'standard' && !componentAvailable(ARMOR_OPTIONS[k], design.era, techOf(design, 'armor'), design.mixedTech)}>
                {ARMOR_NAMES[k]}{n ? ` (${n} slots)` : ''}{ARMOR_NOTES[k] ?? ''}
              </option>
            );
          })}
        </select>{' '}
        <TechPicker design={design} part="armor" update={update} />{' '}
        <span className="muted small">{pptLabel} pts/ton</span>{' '}
        <label className="check small" title="Patchwork armor (Tactical Operations): a different armor type in some locations">
          <input type="checkbox" checked={patch}
            onChange={(e) => { setPatch(e.target.checked); if (!e.target.checked) update(clearPatchwork); }} />
          Patchwork
        </label>
      </h2>
      <table className="armor-table">
        <thead>
          <tr><th>Location</th>{patch && <th>Type</th>}<th>IS</th><th>Front</th><th>Rear</th><th>Max</th></tr>
        </thead>
        <tbody>
          {LOCATIONS.map((loc) => {
            const rear = REAR_FACING[loc];
            const total = locationArmor(design.armor, loc);
            const max = summary.armorMax[loc];
            const over = total > max;
            return (
              <tr key={loc}>
                <td>{locationName(design, loc)}</td>
                {patch && (
                  <td>
                    <select aria-label={`${locationName(design, loc)} armor type`} value={armorTypeAt(design, loc)}
                      onChange={(e) => update((d) => setLocationArmorType(d, loc, e.target.value as ArmorType))}>
                      {patchOptions.map((k) => {
                        const n = patchworkSlots(k, techOf(design, 'armor'));
                        return <option key={k} value={k}>{ARMOR_NAMES[k]}{n ? ` (${n})` : ''}</option>;
                      })}
                    </select>
                  </td>
                )}
                <td className="num muted">{summary.structure?.[loc] ?? '—'}</td>
                <td>
                  <NumberField label={`${locationName(design, loc)} armor`} value={design.armor[loc]} min={0}
                    max={max} width="3.5rem" invalid={over}
                    onChange={(n) => update((d) => setArmor(d, loc, n))} />
                </td>
                <td>
                  {rear && (
                    <NumberField label={`${locationName(design, loc)} rear armor`} value={design.armor[rear]} min={0}
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
            <td>Total</td>{patch && <td />}<td />
            <td colSpan={2} className="num">{summary.armorTotal} pts</td>
            <td className="num muted">{summary.armorMaxTotal}</td>
          </tr>
        </tfoot>
      </table>
      <p className="muted small">
        {summary.weights.armor} tons
        {unused > 0 && summary.armorTotal > 0 && summary.armorTotal < summary.armorMaxTotal &&
          ` (${unused} points paid for but unused)`}
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
