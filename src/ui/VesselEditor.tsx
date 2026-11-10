import { useEffect, useState } from 'react';
import type { HeatSinkType, TechBase } from '../rules/types';
import { TECH_BASE_NAMES } from '../rules/types';
import { getEra, isAvailableIn } from '../rules/eras';
import { HEAT_SINK_OPTIONS, componentAvailable } from '../rules/tables';
import type { Equipment, EquipmentCategory } from '../rules/equipment';
import { ALL_EQUIPMENT, equipmentName, getEquipment, isEquipmentAvailable } from '../rules/equipment';
import type { Issue } from '../rules/validation';
import type {
  BayKind, QuartersKind, VesselArmorType, VesselDesign, VesselLocation, VesselShape, VesselSummary, VesselType,
} from '../rules/vessel';
import {
  BAY_INFO, BAY_KINDS, QUARTERS_KINDS, QUARTERS_NAMES, QUARTERS_TONS, VESSEL_ARCS, VESSEL_ARMOR_NAMES, VESSEL_ARMOR_OPTIONS,
  VESSEL_LOCATION_NAMES, VESSEL_SLOTS_PER_ARC, VESSEL_TONNAGE, VESSEL_TYPE_NAMES, addVesselItem, armorThreshold,
  distributeVesselArmor, emptyVesselArmor, isVesselEquipment, maxBayDoors, removeVesselItem, setVesselArmorTonnage,
  setVesselType, shotsPerBin, updateVesselItem, vesselItemLocations, vesselItemWeight, vesselReadout,
} from '../rules/vessel';
import { AERO_AV } from '../rules/aeroAV';
import { vesselBV, vesselCost } from '../rules/battleValue';
import { NumberField } from './NumberField';
import { ValueCard } from './ValueCard';

interface Props {
  design: VesselDesign;
  summary: VesselSummary;
  issues: Issue[];
  update: (fn: (d: VesselDesign) => VesselDesign) => void;
}

const t = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(1));

/** All panels for building a small craft or DropShip. */
export function VesselEditor(props: Props) {
  return (
    <main className="layout">
      <div className="col">
        <VesselChassisPanel {...props} />
        <VesselArmorPanel {...props} />
        <VesselCrewPanel {...props} />
      </div>
      <div className="col">
        <VesselEquipmentPanel {...props} />
      </div>
      <div className="col">
        <VesselSummaryPanel {...props} />
      </div>
    </main>
  );
}

function VesselChassisPanel({ design, summary, update }: Props) {
  const era = getEra(design.era);
  const advanced = isAvailableIn('3050', design.era);
  const lim = VESSEL_TONNAGE[design.vesselType];
  const max = lim.max[design.shape];
  const hs = summary.heatSinks;
  return (
    <section className="panel">
      <h2>Chassis</h2>
      <div className="form-grid">
        <label>Type</label>
        <div className="row wrap">
          <select aria-label="Vessel type" value={design.vesselType}
            onChange={(e) => update((d) => setVesselType(d, e.target.value as VesselType))}>
            <option value="small-craft">Small craft (up to 200 t)</option>
            <option value="dropship">DropShip</option>
          </select>
          <select aria-label="Hull shape" value={design.shape}
            onChange={(e) => update((d) => ({ ...d, shape: e.target.value as VesselShape }))}>
            <option value="aerodyne">Aerodyne</option>
            <option value="spheroid">Spheroid</option>
          </select>
          <label className="check" title="Military DropShips get more weight-free heat sinks">
            <input type="checkbox" checked={design.military} onChange={(e) => update((d) => ({ ...d, military: e.target.checked }))} />
            Military
          </label>
        </div>

        <label>Tonnage</label>
        <div>
          <NumberField label="Tonnage" value={design.tonnage} min={lim.min} max={max} step={design.vesselType === 'dropship' ? 100 : 5}
            invalid={design.tonnage > max || design.tonnage < lim.min}
            onChange={(n) => update((d) => ({ ...d, tonnage: Math.max(1, Math.round(n)) }))} />
          <span className="muted"> tons ({lim.min.toLocaleString('en-US')}–{max.toLocaleString('en-US')})</span>
        </div>

        <label>Tech base</label>
        <div className="row wrap">
          <select aria-label="Tech base" value={design.techBase} disabled={(era?.techBases.length ?? 1) < 2}
            onChange={(e) => update((d) => ({ ...d, techBase: e.target.value as TechBase }))}>
            {(era?.techBases ?? ['IS']).map((tb) => <option key={tb} value={tb}>{TECH_BASE_NAMES[tb]}</option>)}
          </select>
          <label className="check" title={advanced ? 'Mixed tech uses Advanced rules' : 'Available from the Clan Invasion era (3050)'}>
            <input type="checkbox" checked={design.mixedTech} disabled={!advanced && !design.mixedTech}
              onChange={(e) => update((d) => ({ ...d, mixedTech: e.target.checked }))} />
            Mixed tech
          </label>
        </div>

        <label>Safe thrust</label>
        <div>
          <NumberField label="Safe thrust" value={design.safeThrust} min={0}
            onChange={(n) => update((d) => ({ ...d, safeThrust: Math.max(0, Math.round(n)) }))} />
          <span className="muted"> Max {summary.maxThrust} · engine {t(summary.weights.engine)} t</span>
        </div>

        <label>Structural integrity</label>
        <div>
          <NumberField label="Structural integrity" value={design.si} min={1}
            onChange={(n) => update((d) => ({ ...d, si: Math.max(1, Math.round(n)) }))} />
          <span className="muted"> {t(summary.weights.structure)} t · allows {t(summary.armorMaxWeight)} t of armor</span>
        </div>

        <label>Heat sinks</label>
        <div>
          <NumberField label="Heat sinks" value={design.heatSinks} min={hs.free} invalid={design.heatSinks < hs.free}
            onChange={(n) => update((d) => ({ ...d, heatSinks: Math.max(0, Math.round(n)) }))} />{' '}
          <select aria-label="Heat sink type" value={design.heatSinkType}
            onChange={(e) => update((d) => ({ ...d, heatSinkType: e.target.value as HeatSinkType }))}>
            <option value="single">Single</option>
            <option value="double" disabled={!componentAvailable(HEAT_SINK_OPTIONS.double, design.era, design.techBase, design.mixedTech)}>Double</option>
          </select>
          <span className="muted"> {hs.free} free · dissipates {hs.dissipation}</span>
        </div>

        <label>Fuel</label>
        <div>
          <NumberField label="Fuel tons" value={design.fuelTons} min={0} step={0.5}
            onChange={(n) => update((d) => ({ ...d, fuelTons: Math.max(0, Math.round(n * 2) / 2) }))} />
          <span className="muted"> tons · {summary.fuelPoints.toLocaleString('en-US')} points ({summary.fuelPointsPerTon}/ton, +2% pumps)</span>
        </div>
      </div>
    </section>
  );
}

function VesselArmorPanel({ design, summary, update }: Props) {
  const [tons, setTons] = useState(summary.weights.armor);
  useEffect(() => setTons(summary.weights.armor), [summary.weights.armor]);
  const ppt = summary.armorPointsPerTon;
  return (
    <section className="panel">
      <h2>
        Armor{' '}
        <select aria-label="Armor type" value={design.armorType}
          onChange={(e) => update((d) => ({ ...d, armorType: e.target.value as VesselArmorType }))}>
          {(Object.keys(VESSEL_ARMOR_NAMES) as VesselArmorType[]).map((k) => (
            <option key={k} value={k} disabled={!componentAvailable(VESSEL_ARMOR_OPTIONS[k], design.era, design.techBase, design.mixedTech)}>
              {VESSEL_ARMOR_NAMES[k]}
            </option>
          ))}
        </select>{' '}
        <span className="muted small">{Number.isInteger(ppt) ? ppt : ppt.toFixed(2)} pts/ton</span>
      </h2>
      <table className="armor-table">
        <thead><tr><th>Arc</th><th>Armor</th><th>Threshold</th></tr></thead>
        <tbody>
          {VESSEL_ARCS.map((l) => (
            <tr key={l}>
              <td>{VESSEL_LOCATION_NAMES[l]}</td>
              <td>
                <NumberField label={`${VESSEL_LOCATION_NAMES[l]} armor`} value={design.armor[l]} min={0} width="4.5rem"
                  onChange={(n) => update((d) => ({ ...d, armor: { ...d.armor, [l]: Math.max(0, Math.floor(n)) } }))} />
              </td>
              <td className="num muted">{armorThreshold(design.armor[l])}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className={`num ${summary.weights.armor > summary.armorMaxWeight ? 'bad' : ''}`}>{summary.armorTotal}</td>
            <td className="num muted">of {summary.armorMax}</td>
          </tr>
        </tfoot>
      </table>
      <p className="muted small">{t(summary.weights.armor)} of {t(summary.armorMaxWeight)} tons · includes {4 * design.si} free points from structural integrity</p>
      <div className="row wrap">
        <button onClick={() => update((d) => distributeVesselArmor(d, summary.armorMax))}>Maximize</button>
        <button onClick={() => update((d) => ({ ...d, armor: emptyVesselArmor() }))}>Clear</button>
        <span className="spacer" />
        <NumberField label="Armor tons" value={tons} min={0} max={summary.armorMaxWeight} step={0.5} onChange={setTons} />
        <button onClick={() => update((d) => setVesselArmorTonnage(d, tons))}>Distribute tons</button>
      </div>
    </section>
  );
}

function VesselCrewPanel({ design, summary, update }: Props) {
  const need = summary.crewNeeded;
  const [newBay, setNewBay] = useState<BayKind>('cargo');
  const setCrew = (k: keyof VesselDesign['crew'], n: number) => update((d) => ({ ...d, crew: { ...d.crew, [k]: Math.max(0, Math.round(n)) } }));
  const setQuarters = (k: QuartersKind, n: number) => update((d) => ({ ...d, quarters: { ...d.quarters, [k]: Math.max(0, Math.round(n)) } }));
  return (
    <section className="panel">
      <h2>Crew, quarters &amp; bays</h2>
      <div className="form-grid">
        <label>Crew</label>
        <div>
          <NumberField label="Crew" value={design.crew.crew} min={0} invalid={design.crew.crew < need.total} onChange={(n) => setCrew('crew', n)} />
          <span className="muted small"> needs {need.total}: {need.base} base + {need.gunners} gunners{need.bayPersonnel ? ` + ${need.bayPersonnel} bay personnel` : ''}</span>
        </div>
        <label>Officers / gunners</label>
        <div>
          <NumberField label="Officers" value={design.crew.officers} min={0} invalid={design.crew.officers < need.officers} onChange={(n) => setCrew('officers', n)} />{' '}
          <NumberField label="Gunners" value={design.crew.gunners} min={0} onChange={(n) => setCrew('gunners', n)} />
          <span className="muted small"> at least {need.officers} officers</span>
        </div>
        <label>Passengers / marines</label>
        <div>
          <NumberField label="Passengers" value={design.crew.passengers} min={0} onChange={(n) => setCrew('passengers', n)} />{' '}
          <NumberField label="Marines" value={design.crew.marines} min={0} onChange={(n) => setCrew('marines', n)} />{' '}
          <NumberField label="Battle armor troops" value={design.crew.battleArmor} min={0} onChange={(n) => setCrew('battleArmor', n)} />
          <span className="muted small"> passengers · marines · BA</span>
        </div>
        <label>Quarters</label>
        <div className="quarters-grid">
          {QUARTERS_KINDS.map((q) => (
            <label key={q} className="small">
              {QUARTERS_NAMES[q].replace(' quarters', '')}{' '}
              <NumberField label={QUARTERS_NAMES[q]} value={design.quarters[q]} min={0} width="4rem" onChange={(n) => setQuarters(q, n)} />
              <span className="muted"> ({QUARTERS_TONS[q]} t each)</span>
            </label>
          ))}
          <span className={`small ${summary.quartersCapacity < summary.peopleAboard ? 'bad' : 'muted'}`}>
            {summary.quartersCapacity} berths for {summary.peopleAboard} people
          </span>
        </div>
        <label>Life boats / pods</label>
        <div>
          <NumberField label="Life boats" value={design.lifeboats} min={0} onChange={(n) => update((d) => ({ ...d, lifeboats: Math.max(0, Math.round(n)) }))} />{' '}
          <NumberField label="Escape pods" value={design.escapePods} min={0} onChange={(n) => update((d) => ({ ...d, escapePods: Math.max(0, Math.round(n)) }))} />
          <span className="muted small"> 7 t each</span>
        </div>
      </div>

      <h3>Transport bays <span className={`small ${summary.bayDoors > maxBayDoors(design) ? 'bad' : 'muted'}`}>{summary.bayDoors} / {maxBayDoors(design)} doors</span></h3>
      <ul className="mounted">
        {design.bays.map((b, i) => (
          <li key={i}>
            <span className="item-name">
              <strong style={{ fontWeight: 500 }}>{BAY_INFO[b.kind].name}</strong>
              <span className="muted small">{t(BAY_INFO[b.kind].tons * b.size)} t</span>
            </span>
            <span className="spacer" />
            <NumberField label={`${BAY_INFO[b.kind].name} size`} value={b.size} min={0} width="5rem" step={BAY_INFO[b.kind].cargo ? 0.5 : 1}
              onChange={(n) => update((d) => ({ ...d, bays: d.bays.map((x, j) => (j === i ? { ...x, size: Math.max(0, n) } : x)) }))} />
            <span className="muted small">{BAY_INFO[b.kind].unit}</span>
            <NumberField label="Doors" value={b.doors} min={0} width="3.5rem"
              onChange={(n) => update((d) => ({ ...d, bays: d.bays.map((x, j) => (j === i ? { ...x, doors: Math.max(0, Math.round(n)) } : x)) }))} />
            <span className="muted small">doors</span>
            <button className="small danger" aria-label={`Remove ${BAY_INFO[b.kind].name}`}
              onClick={() => update((d) => ({ ...d, bays: d.bays.filter((_, j) => j !== i) }))}>✕</button>
          </li>
        ))}
      </ul>
      <div className="row wrap">
        <select aria-label="Bay type" value={newBay} onChange={(e) => setNewBay(e.target.value as BayKind)}>
          {BAY_KINDS.map((k) => <option key={k} value={k}>{BAY_INFO[k].name} ({t(BAY_INFO[k].tons)} t per {BAY_INFO[k].unit.replace(/s$/, '')})</option>)}
        </select>
        <button onClick={() => update((d) => ({ ...d, bays: [...d.bays, { kind: newBay, size: BAY_INFO[newBay].cargo ? 10 : 1, doors: BAY_INFO[newBay].cargo ? 1 : 1 }] }))}>Add bay</button>
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

function avText(eq: Equipment): string {
  const av = AERO_AV[eq.id];
  return av ? av.map((v) => (v ? String(v) : '–')).join('/') : '—';
}

function VesselEquipmentPanel({ design, summary, update }: Props) {
  const [tab, setTab] = useState<EquipmentCategory>('Energy');
  const dropship = design.vesselType === 'dropship';
  const available = ALL_EQUIPMENT.filter((e) => isVesselEquipment(e) && isEquipmentAvailable(e, design.era, design.techBase, design.mixedTech));
  const inTab = (e: Equipment, id: EquipmentCategory) => e.category === id || (id === 'Other' && e.category === 'Utility');
  const tabs = TABS.filter((x) => available.some((e) => inTab(e, x.id)));
  const active = tabs.some((x) => x.id === tab) ? tab : 'Energy';
  const catalog = available.filter((e) => inTab(e, active));
  const combat = active !== 'Ammo';
  return (
    <section className="panel">
      <h2>Equipment</h2>
      <div className="arc-slots">
        {VESSEL_ARCS.map((l) => (
          <span key={l} className={summary.slots[l] > VESSEL_SLOTS_PER_ARC ? 'warn' : 'muted'}>
            {VESSEL_LOCATION_NAMES[l]} {summary.slots[l]}/{VESSEL_SLOTS_PER_ARC}
          </span>
        ))}
        {dropship && <span className="muted">· {summary.weaponBays.length} weapon bays</span>}
      </div>
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
              {combat && <><th title="Aerospace attack value: short / medium / long / extreme">AV (S/M/L/E)</th><th>Heat</th></>}
              <th>Tons</th><th />
            </tr>
          </thead>
          <tbody>
            {catalog.map((eq) => {
              const tons = vesselItemWeight(eq, design);
              return (
                <tr key={eq.id}>
                  <td>{equipmentName(eq, design)}</td>
                  {combat && <><td className="num">{eq.isWeapon ? avText(eq) : '—'}</td><td className="num">{eq.isWeapon ? eq.heat : 0}</td></>}
                  <td className="num">{tons}</td>
                  <td>
                    <button className="small" disabled={tons > summary.weights.free} title={tons > summary.weights.free ? 'Not enough free tonnage' : 'Add'}
                      onClick={() => update((d) => addVesselItem(d, eq.id))}>Add</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Mounted <span className="muted small">({design.equipment.length} items)</span></h3>
      {dropship && design.equipment.length > 0 && <p className="small muted">Weapons with the same bay number in an arc share a weapon bay.</p>}
      <ul className="mounted">
        {design.equipment.map((item) => {
          const eq = getEquipment(item.equipmentId);
          if (!eq) return null;
          const side = item.location === 'LS' || item.location === 'RS';
          return (
            <li key={item.uid} className={item.location ? '' : 'unallocated'}>
              <span className="item-name">
                <strong style={{ fontWeight: 500 }}>{equipmentName(eq, design)}</strong>
                <span className="muted small">{t(vesselItemWeight(eq, design, item))} t</span>
              </span>
              <span className="spacer" />
              {eq.category === 'Ammo' && (
                <>
                  <NumberField label={`${eq.name} shots`} value={item.shots ?? shotsPerBin(eq)} min={1} width="4.5rem" step={shotsPerBin(eq)}
                    onChange={(n) => update((d) => updateVesselItem(d, item.uid, { shots: Math.max(1, Math.round(n)) }))} />
                  <span className="muted small">shots</span>
                </>
              )}
              {eq.isWeapon && dropship && (
                <label className="small">Bay <NumberField label={`${eq.name} bay`} value={item.bay ?? 1} min={1} width="3.5rem"
                  onChange={(n) => update((d) => updateVesselItem(d, item.uid, { bay: Math.max(1, Math.round(n)) }))} /></label>
              )}
              <select aria-label={`${eq.name} location`} value={item.location ?? ''}
                onChange={(e) => update((d) => updateVesselItem(d, item.uid, { location: (e.target.value || null) as VesselLocation | null }))}>
                <option value="">— unallocated —</option>
                {vesselItemLocations(eq).map((l) => <option key={l} value={l}>{VESSEL_LOCATION_NAMES[l]}</option>)}
              </select>
              {eq.isWeapon && side && (
                <label className="check small">
                  <input type="checkbox" checked={!!item.rear} onChange={(e) => update((d) => updateVesselItem(d, item.uid, { rear: e.target.checked || undefined }))} />
                  Rear
                </label>
              )}
              <button className="small danger" aria-label={`Remove ${eq.name}`} onClick={() => update((d) => removeVesselItem(d, item.uid))}>✕</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function VesselSummaryPanel({ design, summary, issues }: Props) {
  const [copied, setCopied] = useState(false);
  const w = summary.weights;
  const rows: [string, number][] = ([
    ['Structure', w.structure], ['Engine', w.engine], ['Control systems', w.controls], ['Fuel (with pumps)', w.fuel],
    ['Heat sinks', w.heatSinks], ['Armor', w.armor], ['Extra fire control', w.fireControl], ['Life boats / escape pods', w.lifeboats],
    ['Weapons & equipment', w.equipment], ['Ammunition', w.ammo], ['Transport bays', w.bays], ['Quarters', w.quarters],
  ] as [string, number][]).filter(([l, v]) => v > 0 || ['Structure', 'Engine', 'Armor'].includes(l));
  const pct = Math.min(100, (w.total / Math.max(1, design.tonnage)) * 100);
  const errors = issues.filter((i) => i.severity === 'error');
  const bv = vesselBV(design);
  const cost = vesselCost(design);
  const readout = vesselReadout(design, summary, { bv: bv.total, cost: cost.total });
  return (
    <section className="panel">
      <h2>Summary</h2>
      <div className={`weight-bar ${w.free < 0 ? 'over' : ''}`} aria-label="Tonnage used"><div style={{ width: `${pct}%` }} /></div>
      <p className="weight-line">
        <strong>{t(w.total)}</strong> / {t(design.tonnage)} tons{' '}
        <span className={w.free < 0 ? 'bad' : 'muted'}>({w.free < 0 ? `${t(-w.free)} over` : `${t(w.free)} free`})</span>
      </p>
      <table className="weights"><tbody>{rows.map(([label, v]) => <tr key={label}><td>{label}</td><td className="num">{t(v)}</td></tr>)}</tbody></table>
      <div className="stats">
        <div><span className="muted">Thrust</span> {design.safeThrust}/{summary.maxThrust}</div>
        <div><span className="muted">Type</span> {VESSEL_TYPE_NAMES[design.vesselType]}</div>
        <div><span className="muted">Weapon heat</span> {summary.weaponHeat}/{summary.heatSinks.dissipation}</div>
        <div><span className="muted">SI</span> {design.si}</div>
      </div>
      <ValueCard bv={bv} cost={cost} />
      <h3 id="validation">
        Validation{' '}
        {errors.length === 0 ? <span className="ok small">✓ legal design</span> : <span className="bad small">{errors.length} error{errors.length > 1 ? 's' : ''}</span>}
      </h3>
      <ul className="issues">{issues.map((i, n) => <li key={n} className={i.severity}>{i.message}</li>)}</ul>
      <h3>
        Technical readout{' '}
        <button className="small" onClick={() => {
          navigator.clipboard?.writeText(readout).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
        }}>{copied ? 'Copied' : 'Copy'}</button>
      </h3>
      <pre className="readout">{readout}</pre>
    </section>
  );
}
