import { useState } from 'react';
import type { Location, MechDesign } from '../rules/types';
import { LOCATION_NAMES } from '../rules/types';
import type { MechSummary } from '../rules/construction';
import { itemWeight } from '../rules/construction';
import type { Equipment, EquipmentCategory } from '../rules/equipment';
import { ALL_EQUIPMENT, allowedLocations, canRearMount, getEquipment } from '../rules/equipment';
import { addEquipment, removeEquipment, setItemLocation, setItemRear } from '../rules/edit';

interface Props {
  design: MechDesign;
  summary: MechSummary;
  update: (fn: (d: MechDesign) => MechDesign) => void;
  selected: string | null;
  setSelected: (uid: string | null) => void;
}

const TABS: EquipmentCategory[] = ['Energy', 'Ballistic', 'Missile', 'Ammo'];

function rangeText(eq: Equipment): string {
  if (!eq.range) return '';
  const { min, short, medium, long } = eq.range;
  return `${min ? `(${min}) ` : ''}${short}/${medium}/${long}`;
}

export function EquipmentPanel({ design, summary, update, selected, setSelected }: Props) {
  const [tab, setTab] = useState<EquipmentCategory>('Energy');
  const catalog = ALL_EQUIPMENT.filter((e) => e.category === tab && !e.managed);
  const mountedWeapons = new Set(design.equipment.map((e) => e.equipmentId));

  return (
    <section className="panel">
      <h2>Equipment</h2>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className="table-scroll">
        <table className="catalog">
          <thead>
            <tr>
              <th>Name</th>
              {tab !== 'Ammo' && <><th>Dmg</th><th>Heat</th><th>Range</th></>}
              <th>Tons</th><th>Crits</th><th />
            </tr>
          </thead>
          <tbody>
            {catalog.map((eq) => (
              <tr key={eq.id} className={eq.ammoFor && !mountedWeapons.has(eq.ammoFor) ? 'dim' : ''}>
                <td>{eq.name}</td>
                {tab !== 'Ammo' && (
                  <><td className="num">{eq.damage}</td><td className="num">{eq.heat}</td><td>{rangeText(eq)}</td></>
                )}
                <td className="num">{eq.tons}</td>
                <td className="num">{eq.slots}</td>
                <td>
                  <button className="small" disabled={eq.tons > summary.weights.free}
                    title={eq.tons > summary.weights.free ? 'Not enough free tonnage' : 'Add to mech'}
                    onClick={() => update((d) => addEquipment(d, eq.id))}>Add</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Mounted <span className="muted small">({design.equipment.length} items)</span></h3>
      {design.equipment.length === 0 && <p className="muted">Nothing mounted yet.</p>}
      <ul className="mounted">
        {design.equipment.map((item) => {
          const eq = getEquipment(item.equipmentId);
          if (!eq) return null;
          return (
            <li key={item.uid} className={`${item.location ? '' : 'unallocated'} ${selected === item.uid ? 'selected' : ''}`}>
              <button className="link" title="Select, then click a location in the critical slot diagram"
                onClick={() => setSelected(selected === item.uid ? null : item.uid)}>
                {eq.name}
              </button>
              <span className="muted small">{itemWeight(eq, design.tonnage)} t · {eq.slots} crit</span>
              <span className="spacer" />
              <select aria-label={`${eq.name} location`} value={item.location ?? ''}
                onChange={(e) => update((d) => setItemLocation(d, item.uid, (e.target.value || null) as Location | null))}>
                <option value="">— unallocated —</option>
                {allowedLocations(eq).map((loc) => (
                  <option key={loc} value={loc}>
                    {LOCATION_NAMES[loc]} ({summary.slots[loc].free} free)
                  </option>
                ))}
              </select>
              {canRearMount(eq, item.location) && (
                <label className="check small">
                  <input type="checkbox" checked={!!item.rear}
                    onChange={(e) => update((d) => setItemRear(d, item.uid, e.target.checked))} />
                  Rear
                </label>
              )}
              <button className="small danger" aria-label={`Remove ${eq.name}`}
                onClick={() => update((d) => removeEquipment(d, item.uid))}>✕</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
