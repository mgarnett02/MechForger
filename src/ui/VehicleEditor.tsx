import { useEffect, useState } from 'react';
import type { ArmorType, StructureType, TechBase } from '../rules/types';
import { TECH_BASE_NAMES } from '../rules/types';
import { ERAS, getEra, isAvailableIn } from '../rules/eras';
import type { ComponentOption } from '../rules/tables';
import { ARMOR_OPTIONS, STRUCTURE_OPTIONS, componentAvailable, componentEraOk, componentFirstEra } from '../rules/tables';
import type { Equipment, EquipmentCategory } from '../rules/equipment';
import { ALL_EQUIPMENT, equipmentName, getEquipment, isEquipmentAvailable } from '../rules/equipment';
import { armorPointsForTons, armorTonnage } from '../rules/armor';
import type { Issue } from '../rules/validation';
import type {
  MotiveType, VehicleArmorLocation, VehicleDesign, VehicleEngineType, VehicleLocation, VehicleSummary,
} from '../rules/vehicle';
import {
  MOTIVE_ORDER, MOTIVE_TYPES, VEHICLE_ENGINE_LABELS, VEHICLE_ENGINE_OPTIONS, VEHICLE_LOCATION_NAMES,
  VTOL_ROTOR_MAX_ARMOR, addVehicleItem, distributeVehicleArmor, emptyVehicleArmor, isVehicleEquipment,
  removeVehicleItem, setVehicleArmorTonnage, setVehicleEngine, setVehicleItemLocation, setVehicleMotive,
  setVehicleTurret, turretName, vehicleArmorSlots, vehicleItemLocations, vehicleItemWeight, vehicleReadout,
  vehicleStructureSlots,
} from '../rules/vehicle';
import { NumberField } from './NumberField';
import { vehicleBV, vehicleCost } from '../rules/battleValue';
import { ValueCard } from './ValueCard';

interface Props {
  design: VehicleDesign;
  summary: VehicleSummary;
  issues: Issue[];
  update: (fn: (d: VehicleDesign) => VehicleDesign) => void;
}

const t = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** All panels for building a combat vehicle. */
export function VehicleEditor(props: Props) {
  return (
    <main className="layout">
      <div className="col">
        <VehicleChassisPanel {...props} />
        <VehicleArmorPanel {...props} />
      </div>
      <div className="col">
        <VehicleEquipmentPanel {...props} />
      </div>
      <div className="col">
        <VehicleSummaryPanel {...props} />
      </div>
    </main>
  );
}

function useAvailability(d: VehicleDesign) {
  const ok = (o: ComponentOption) => componentAvailable(o, d.era, d.techBase, d.mixedTech);
  const why = (o: ComponentOption) => {
    if (!componentEraOk(o, d.era, d.techBase)) {
      const first = ERAS.find((e) => e.id === componentFirstEra(o, d.techBase));
      return `Available from the ${first?.name} era (${first?.year})`;
    }
    return ok(o) ? undefined : 'Inner Sphere technology: needs mixed tech on a Clan design';
  };
  return { ok, why };
}

function VehicleChassisPanel({ design, summary, update }: Props) {
  const era = getEra(design.era);
  const motive = MOTIVE_TYPES[design.motive];
  const { ok, why } = useAvailability(design);
  const advanced = isAvailableIn('3050', design.era);
  const endoSlots = vehicleStructureSlots('endo-steel', design.techBase);
  return (
    <section className="panel">
      <h2>Chassis</h2>
      <div className="form-grid">
        <label>Motive type</label>
        <div>
          <select aria-label="Motive type" value={design.motive}
            onChange={(e) => update((d) => setVehicleMotive(d, e.target.value as MotiveType))}>
            {MOTIVE_ORDER.map((m) => (
              <option key={m} value={m}>{MOTIVE_TYPES[m].name} (up to {MOTIVE_TYPES[m].maxTonnage} t)</option>
            ))}
          </select>
        </div>

        <label>Tonnage</label>
        <div>
          <NumberField label="Tonnage" value={design.tonnage} min={1} max={motive.maxTonnage}
            invalid={design.tonnage > motive.maxTonnage}
            onChange={(n) => update((d) => ({ ...d, tonnage: Math.max(1, Math.round(n)) }))} />
          <span className="muted"> {summary.weightClass}</span>
        </div>

        <label>Tech base</label>
        <div>
          <select aria-label="Tech base" value={design.techBase} disabled={(era?.techBases.length ?? 1) < 2}
            onChange={(e) => update((d) => ({ ...d, techBase: e.target.value as TechBase }))}>
            {(era?.techBases ?? ['IS']).map((tb) => <option key={tb} value={tb}>{TECH_BASE_NAMES[tb]}</option>)}
          </select>{' '}
          <label className="check" title={advanced ? 'Mixed tech uses Advanced rules' : 'Available from the Clan Invasion era (3050)'}>
            <input type="checkbox" checked={design.mixedTech} disabled={!advanced && !design.mixedTech}
              onChange={(e) => update((d) => ({ ...d, mixedTech: e.target.checked }))} />
            Mixed tech
          </label>
        </div>

        <label>Structure</label>
        <div>
          <select aria-label="Internal structure" value={design.structureType}
            onChange={(e) => update((d) => ({ ...d, structureType: e.target.value as StructureType }))}>
            <option value="standard">Standard</option>
            <option value="endo-steel" disabled={!ok(STRUCTURE_OPTIONS['endo-steel'])} title={why(STRUCTURE_OPTIONS['endo-steel'])}>
              Endo Steel ({endoSlots} slot{endoSlots > 1 ? 's' : ''})
            </option>
          </select>
          <span className="muted"> {summary.weights.structure} t · {summary.structurePoints} per location</span>
        </div>

        <label>Cruising MP</label>
        <div>
          <NumberField label="Cruising MP" value={design.cruiseMP} min={1}
            onChange={(n) => update((d) => ({ ...d, cruiseMP: Math.max(1, Math.round(n)) }))} />
          <span className="muted"> Flank {summary.flankMP}</span>
        </div>

        <label>Engine</label>
        <div>
          <select aria-label="Engine type" value={design.engineType}
            onChange={(e) => update((d) => setVehicleEngine(d, e.target.value as VehicleEngineType))}>
            {(Object.keys(VEHICLE_ENGINE_OPTIONS) as VehicleEngineType[]).map((k) => (
              <option key={k} value={k} disabled={!ok(VEHICLE_ENGINE_OPTIONS[k])} title={why(VEHICLE_ENGINE_OPTIONS[k])}>
                {summary.rating} {VEHICLE_ENGINE_LABELS[k]}
              </option>
            ))}
          </select>
          <span className="muted"> {summary.engineWeight ?? '—'} t</span>
          <div className="small muted">
            Rating = {design.cruiseMP} × {design.tonnage} − {summary.suspension} suspension
            {design.engineType !== 'ice' ? ' · includes fusion shielding' : ''}
          </div>
        </div>

        <label>Turret</label>
        <div>
          <label className="check">
            <input type="checkbox" checked={design.turret}
              onChange={(e) => update((d) => setVehicleTurret(d, e.target.checked))} />
            {turretName(design)}
          </label>
          {design.turret && <span className="muted"> {summary.weights.turret} t (10% of turret weapons)</span>}
        </div>

        <label>Troop / cargo</label>
        <div>
          <NumberField label="Troop and cargo space" value={design.cargo ?? 0} min={0} step={0.5}
            onChange={(n) => update((d) => ({ ...d, cargo: n > 0 ? Math.round(n * 2) / 2 : undefined }))} />
          <span className="muted"> tons{(design.cargo ?? 0) > 0 ? ' · 1 item slot' : ''}</span>
        </div>

        <label>Heat sinks</label>
        <div>
          <NumberField label="Heat sinks" value={design.heatSinks} min={summary.freeHeatSinks}
            invalid={design.heatSinks < summary.energyHeat || design.heatSinks < summary.freeHeatSinks}
            onChange={(n) => update((d) => ({ ...d, heatSinks: Math.max(0, Math.round(n)) }))} />
          <span className="muted">
            {' '}single · {summary.freeHeatSinks} free · energy weapons need {summary.energyHeat}
          </span>
        </div>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>{motive.description}</p>
    </section>
  );
}

function VehicleArmorPanel({ design, summary, update }: Props) {
  const [tons, setTons] = useState(summary.weights.armor);
  useEffect(() => setTons(summary.weights.armor), [summary.weights.armor]);
  const ppt = summary.armorPointsPerTon;
  const maxTons = armorTonnage(summary.armorMax, ppt);
  const unused = armorPointsForTons(summary.weights.armor, ppt) - summary.armorTotal;
  const opt = (k: ArmorType) => componentAvailable(ARMOR_OPTIONS[k], design.era, design.techBase, design.mixedTech);
  const slots = (k: ArmorType) => vehicleArmorSlots(k, design.techBase);
  return (
    <section className="panel">
      <h2>
        Armor{' '}
        <select aria-label="Armor type" value={design.armorType}
          onChange={(e) => update((d) => ({ ...d, armorType: e.target.value as ArmorType }))}>
          <option value="standard">Standard</option>
          <option value="ferro-fibrous" disabled={!opt('ferro-fibrous')}>Ferro-Fibrous ({slots('ferro-fibrous')} slots)</option>
          <option value="light-ferro" disabled={!opt('light-ferro')}>Light Ferro-Fibrous ({slots('light-ferro')} slot)</option>
          <option value="heavy-ferro" disabled={!opt('heavy-ferro')}>Heavy Ferro-Fibrous ({slots('heavy-ferro')} slots)</option>
        </select>{' '}
        <span className="muted small">{Number.isInteger(ppt) ? ppt : ppt.toFixed(2)} pts/ton</span>
      </h2>
      <table className="armor-table">
        <thead><tr><th>Location</th><th>IS</th><th>Armor</th><th /></tr></thead>
        <tbody>
          {summary.armorLocations.map((l: VehicleArmorLocation) => (
            <tr key={l}>
              <td>{l === 'TU' ? turretName(design) : VEHICLE_LOCATION_NAMES[l]}</td>
              <td className="num muted">{summary.structurePoints}</td>
              <td>
                <NumberField label={`${VEHICLE_LOCATION_NAMES[l]} armor`} value={design.armor[l]} min={0}
                  max={l === 'RO' ? VTOL_ROTOR_MAX_ARMOR : undefined} width="3.5rem"
                  invalid={l === 'RO' && design.armor.RO > VTOL_ROTOR_MAX_ARMOR}
                  onChange={(n) => update((d) => ({ ...d, armor: { ...d.armor, [l]: Math.max(0, Math.floor(n)) } }))} />
              </td>
              <td className="muted small">{l === 'RO' ? `max ${VTOL_ROTOR_MAX_ARMOR}` : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td><td />
            <td className={`num ${summary.armorTotal > summary.armorMax ? 'bad' : ''}`}>{summary.armorTotal}</td>
            <td className="num muted">of {summary.armorMax}</td>
          </tr>
        </tfoot>
      </table>
      <p className="muted small">
        {summary.weights.armor} tons
        {unused > 0 && summary.armorTotal > 0 && summary.armorTotal < summary.armorMax && ` (${unused} points paid for but unused)`}
      </p>
      <div className="row wrap">
        <button onClick={() => update((d) => distributeVehicleArmor(d, summary.armorMax))}>Maximize</button>
        <button onClick={() => update((d) => ({ ...d, armor: emptyVehicleArmor() }))}>Clear</button>
        <span className="spacer" />
        <NumberField label="Armor tons" value={tons} min={0} max={maxTons} step={0.5} onChange={setTons} />
        <button onClick={() => update((d) => setVehicleArmorTonnage(d, tons))}>Distribute tons</button>
      </div>
    </section>
  );
}

const TABS: { id: EquipmentCategory; label: string }[] = [
  { id: 'Energy', label: 'Energy' },
  { id: 'Ballistic', label: 'Ballistic' },
  { id: 'Missile', label: 'Missile' },
  { id: 'Ammo', label: 'Ammo' },
  { id: 'Other', label: 'Equipment' },
];

function rangeText(eq: Equipment): string {
  if (!eq.range) return '—';
  const { min, short, medium, long } = eq.range;
  return `${min ? `(${min}) ` : ''}${short}/${medium}/${long || '—'}`;
}

function VehicleEquipmentPanel({ design, summary, update }: Props) {
  const [tab, setTab] = useState<EquipmentCategory>('Energy');
  const available = ALL_EQUIPMENT.filter(
    (e) => isVehicleEquipment(e) && isEquipmentAvailable(e, design.era, design.techBase, design.mixedTech),
  );
  const tabs = TABS.filter((x) => available.some((e) => e.category === x.id));
  const active = tabs.some((x) => x.id === tab) ? tab : 'Energy';
  const catalog = available.filter((e) => e.category === active);
  const mountedIds = new Set(design.equipment.map((e) => e.equipmentId));
  const combat = active !== 'Ammo';
  const slotsFull = summary.slots.used >= summary.slots.capacity;

  return (
    <section className="panel">
      <h2>
        Equipment{' '}
        <span className={`small ${summary.slots.used > summary.slots.capacity ? 'bad' : 'muted'}`}>
          {summary.slots.used} / {summary.slots.capacity} item slots
        </span>
      </h2>
      <div className="tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={active === x.id}
            className={active === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>{x.label}</button>
        ))}
      </div>
      <div className="table-scroll">
        <table className="catalog">
          <thead>
            <tr>
              <th>Name</th>
              {combat && <><th>Dmg</th><th>Heat</th><th>Range</th></>}
              <th>Tons</th><th />
            </tr>
          </thead>
          <tbody>
            {catalog.map((eq) => {
              const tons = vehicleItemWeight(eq, design);
              const tooHeavy = tons > summary.weights.free;
              // A new bin of an ammo type already carried needs no extra slot.
              const needsSlot = !(eq.category === 'Ammo' && mountedIds.has(eq.id));
              const blocked = tooHeavy || (slotsFull && needsSlot);
              return (
                <tr key={eq.id} className={eq.ammoFor && !mountedIds.has(eq.ammoFor) ? 'dim' : ''}>
                  <td>{equipmentName(eq, design)}</td>
                  {combat && (
                    <>
                      <td className="num">{eq.damage ?? '—'}</td>
                      {/* Only energy weapons generate heat on vehicles. */}
                      <td className="num">{eq.isWeapon && eq.category === 'Energy' ? eq.heat : 0}</td>
                      <td>{rangeText(eq)}</td>
                    </>
                  )}
                  <td className="num">{tons}</td>
                  <td>
                    <button className="small" disabled={blocked}
                      title={tooHeavy ? 'Not enough free tonnage' : blocked ? 'No free item slots' : 'Add to vehicle'}
                      onClick={() => update((d) => addVehicleItem(d, eq.id))}>Add</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Mounted <span className="muted small">({design.equipment.length} items)</span></h3>
      {design.equipment.length === 0 && <p className="muted">Nothing mounted yet. Weapons go in a firing arc; ammunition and other equipment in the body.</p>}
      <ul className="mounted">
        {design.equipment.map((item) => {
          const eq = getEquipment(item.equipmentId);
          if (!eq) return null;
          const locs = vehicleItemLocations(eq, design);
          return (
            <li key={item.uid} className={item.location ? '' : 'unallocated'}>
              <span className="item-name">
                <strong style={{ fontWeight: 500 }}>{equipmentName(eq, design)}</strong>
                <span className="muted small">{vehicleItemWeight(eq, design)} t</span>
              </span>
              <span className="spacer" />
              <select aria-label={`${eq.name} location`} value={item.location ?? ''}
                onChange={(e) => update((d) => setVehicleItemLocation(d, item.uid, (e.target.value || null) as VehicleLocation | null))}>
                <option value="">— unallocated —</option>
                {locs.map((l) => (
                  <option key={l} value={l}>{l === 'TU' ? turretName(design) : VEHICLE_LOCATION_NAMES[l]}</option>
                ))}
              </select>
              <button className="small danger" aria-label={`Remove ${eq.name}`}
                onClick={() => update((d) => removeVehicleItem(d, item.uid))}>✕</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function VehicleSummaryPanel({ design, summary, issues }: Props) {
  const [copied, setCopied] = useState(false);
  const w = summary.weights;
  const motive = MOTIVE_TYPES[design.motive];
  const rows: [string, number][] = [
    ['Internal structure', w.structure],
    ['Engine', w.engine],
    ...(motive.liftName ? [[motive.liftName, w.lift] as [string, number]] : []),
    ['Control equipment', w.controls],
    ...(design.turret ? [[turretName(design), w.turret] as [string, number]] : []),
    ...(w.powerAmplifiers ? [['Power amplifiers', w.powerAmplifiers] as [string, number]] : []),
    ...(w.cargo ? [['Troop / cargo space', w.cargo] as [string, number]] : []),
    ['Heat sinks', w.heatSinks],
    ['Armor', w.armor],
    ['Weapons & equipment', w.equipment],
  ];
  const pct = Math.min(100, (w.total / Math.max(1, design.tonnage)) * 100);
  const errors = issues.filter((i) => i.severity === 'error');
  const bv = vehicleBV(design);
  const cost = vehicleCost(design);
  const readout = vehicleReadout(design, summary, { bv: bv.total, cost: cost.total });
  return (
    <section className="panel">
      <h2>Summary</h2>
      <div className={`weight-bar ${w.free < 0 ? 'over' : ''}`} aria-label="Tonnage used">
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="weight-line">
        <strong>{t(w.total)}</strong> / {design.tonnage} tons{' '}
        <span className={w.free < 0 ? 'bad' : 'muted'}>({w.free < 0 ? `${t(-w.free)} over` : `${t(w.free)} free`})</span>
      </p>
      <table className="weights">
        <tbody>
          {rows.map(([label, v]) => <tr key={label}><td>{label}</td><td className="num">{t(v)}</td></tr>)}
        </tbody>
      </table>
      <div className="stats">
        <div><span className="muted">Move</span> {design.cruiseMP}/{summary.flankMP}</div>
        <div><span className="muted">Type</span> {motive.name}</div>
        <div><span className="muted">Energy heat</span> {summary.energyHeat}/{design.heatSinks}</div>
        <div><span className="muted">Armor</span> {summary.armorTotal}/{summary.armorMax}</div>
      </div>
      <ValueCard bv={bv} cost={cost} />
      <h3 id="validation">
        Validation{' '}
        {errors.length === 0
          ? <span className="ok small">✓ legal design</span>
          : <span className="bad small">{errors.length} error{errors.length > 1 ? 's' : ''}</span>}
      </h3>
      <ul className="issues">
        {issues.map((i, n) => <li key={n} className={i.severity}>{i.message}</li>)}
      </ul>
      <h3>
        Technical readout{' '}
        <button className="small" onClick={() => {
          navigator.clipboard?.writeText(readout).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }, () => {});
        }}>{copied ? 'Copied' : 'Copy'}</button>
      </h3>
      <pre className="readout">{readout}</pre>
    </section>
  );
}
