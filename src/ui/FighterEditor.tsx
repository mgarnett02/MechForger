import { useEffect, useState } from 'react';
import type { HeatSinkType, TechBase } from '../rules/types';
import { TECH_BASE_NAMES } from '../rules/types';
import { ERAS, getEra, isAvailableIn } from '../rules/eras';
import type { ComponentOption } from '../rules/tables';
import { ARMOR_OPTIONS, COCKPIT_OPTIONS, HEAT_SINK_OPTIONS, componentAvailable, componentEraOk, componentFirstEra } from '../rules/tables';
import type { Equipment, EquipmentCategory } from '../rules/equipment';
import { ALL_EQUIPMENT, equipmentName, getEquipment, isEquipmentAvailable } from '../rules/equipment';
import { armorPointsForTons, armorTonnage } from '../rules/armor';
import type { Issue } from '../rules/validation';
import type { FighterArmorType, FighterCockpitType, FighterDesign, FighterEngineType, FighterLocation, FighterSummary, FighterType } from '../rules/fighter';
import {
  FIGHTER_ARCS, FIGHTER_ARMOR_NAMES, FIGHTER_ARMOR_SLOTS, FIGHTER_ENGINE_LABELS, FIGHTER_ENGINE_OPTIONS,
  FIGHTER_LOCATION_NAMES, FIGHTER_MAX_TONNAGE, FIGHTER_TYPE_NAMES, FUEL_POINTS_PER_TON, addFighterItem, armorThreshold,
  distributeFighterArmor, emptyFighterArmor, fighterItemLocations, fighterItemWeight, fighterReadout, isFighterEquipment,
  removeFighterItem, setFighterArmorTonnage, setFighterItemLocation, setFighterItemRear, setFighterType, usesWeaponSlot,
} from '../rules/fighter';
import { AERO_AV } from '../rules/aeroAV';
import { fighterBV, fighterCost } from '../rules/battleValue';
import { NumberField } from './NumberField';
import { ValueCard } from './ValueCard';

interface Props {
  design: FighterDesign;
  summary: FighterSummary;
  issues: Issue[];
  update: (fn: (d: FighterDesign) => FighterDesign) => void;
}

const t = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** All panels for building an aerospace or conventional fighter. */
export function FighterEditor(props: Props) {
  return (
    <main className="layout">
      <div className="col">
        <FighterChassisPanel {...props} />
        <FighterArmorPanel {...props} />
      </div>
      <div className="col">
        <FighterEquipmentPanel {...props} />
      </div>
      <div className="col">
        <FighterSummaryPanel {...props} />
      </div>
    </main>
  );
}

function useAvailability(d: FighterDesign) {
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

function FighterChassisPanel({ design, summary, update }: Props) {
  const era = getEra(design.era);
  const { ok, why } = useAvailability(design);
  const advanced = isAvailableIn('3050', design.era);
  const conventional = design.fighterType === 'conventional';
  const max = FIGHTER_MAX_TONNAGE[design.fighterType];
  const tonnages = Array.from({ length: max / 5 }, (_, i) => (i + 1) * 5);
  const engines = (Object.keys(FIGHTER_ENGINE_OPTIONS) as FighterEngineType[]).filter((k) => conventional || k !== 'ice');
  const hs = summary.heatSinks;
  return (
    <section className="panel">
      <h2>Chassis</h2>
      <div className="form-grid">
        <label>Type</label>
        <div>
          <select aria-label="Fighter type" value={design.fighterType}
            onChange={(e) => update((d) => setFighterType(d, e.target.value as FighterType))}>
            <option value="aerospace">Aerospace fighter (5–100 t)</option>
            <option value="conventional">Conventional fighter (5–50 t)</option>
          </select>
        </div>

        <label>Tonnage</label>
        <div>
          <select aria-label="Tonnage" value={design.tonnage}
            onChange={(e) => update((d) => ({ ...d, tonnage: Number(e.target.value) }))}>
            {tonnages.map((n) => <option key={n} value={n}>{n} tons</option>)}
          </select>
          <span className="muted"> {summary.weightClass}</span>
        </div>

        <label>Tech base</label>
        <div>
          <select aria-label="Tech base" value={design.techBase} disabled={(era?.techBases.length ?? 1) < 2}
            onChange={(e) => update((d) => ({ ...d, techBase: e.target.value as TechBase }))}>
            {(era?.techBases ?? ['IS']).map((tb) => <option key={tb} value={tb}>{TECH_BASE_NAMES[tb]}</option>)}
          </select>
        </div>

        <label>Options</label>
        <div className="row wrap">
          <label className="check" title={advanced ? 'Mixed tech uses Advanced rules' : 'Available from the Clan Invasion era (3050)'}>
            <input type="checkbox" checked={design.mixedTech} disabled={!advanced && !design.mixedTech}
              onChange={(e) => update((d) => ({ ...d, mixedTech: e.target.checked }))} />
            Mixed tech
          </label>
          {!conventional && (
            <label className="check" title={advanced ? 'Pod-mounted weapons: costs 25% more' : 'Available from the Clan Invasion era (3050)'}>
              <input type="checkbox" checked={design.omni} disabled={!advanced && !design.omni}
                onChange={(e) => update((d) => ({ ...d, omni: e.target.checked }))} />
              OmniFighter
            </label>
          )}
          {conventional && (
            <label className="check" title="Vertical / short take-off and landing gear: 5% of tonnage">
              <input type="checkbox" checked={design.vstol} onChange={(e) => update((d) => ({ ...d, vstol: e.target.checked }))} />
              VSTOL
            </label>
          )}
        </div>

        <label>Safe thrust</label>
        <div>
          <NumberField label="Safe thrust" value={design.safeThrust} min={1}
            onChange={(n) => update((d) => ({ ...d, safeThrust: Math.max(1, Math.round(n)) }))} />
          <span className="muted"> Max thrust {summary.maxThrust} · SI {summary.si}</span>
        </div>

        <label>Engine</label>
        <div>
          <select aria-label="Engine type" value={design.engineType}
            onChange={(e) => update((d) => ({ ...d, engineType: e.target.value as FighterEngineType }))}>
            {engines.map((k) => (
              <option key={k} value={k} disabled={!ok(FIGHTER_ENGINE_OPTIONS[k])} title={why(FIGHTER_ENGINE_OPTIONS[k])}>
                {summary.rating} {FIGHTER_ENGINE_LABELS[k]}
              </option>
            ))}
          </select>
          <span className="muted"> {summary.engineWeight ?? '—'} t</span>
          <div className="small muted">
            Rating = {design.tonnage} × {conventional ? `${design.safeThrust} thrust` : `(${design.safeThrust} − 2) thrust`}
            {conventional && design.engineType !== 'ice' ? ' · includes fusion shielding' : ''}
          </div>
        </div>

        {!conventional && (
          <>
            <label>Cockpit</label>
            <div>
              <select aria-label="Cockpit" value={design.cockpitType}
                onChange={(e) => update((d) => {
                  const cockpitType = e.target.value as FighterCockpitType;
                  const armorType = cockpitType === 'primitive' ? 'primitive' : d.armorType === 'primitive' ? 'standard' : d.armorType;
                  return { ...d, cockpitType, armorType };
                })}>
                <option value="standard">Standard</option>
                <option value="small" disabled={!ok(COCKPIT_OPTIONS.small)} title={why(COCKPIT_OPTIONS.small)}>Small</option>
                <option value="primitive">Primitive (engine × 1.2)</option>
              </select>
              <span className="muted"> {summary.weights.controls} t</span>
            </div>
          </>
        )}

        <label>Heat sinks</label>
        <div>
          {!conventional && (
            <NumberField label="Heat sinks" value={design.heatSinks} min={hs.free} invalid={design.heatSinks < hs.free}
              onChange={(n) => update((d) => ({ ...d, heatSinks: Math.max(0, Math.round(n)) }))} />
          )}{' '}
          <select aria-label="Heat sink type" value={design.heatSinkType}
            onChange={(e) => update((d) => ({ ...d, heatSinkType: e.target.value as HeatSinkType }))}>
            <option value="single">Single</option>
            <option value="double" disabled={!ok(HEAT_SINK_OPTIONS.double)} title={why(HEAT_SINK_OPTIONS.double)}>Double</option>
          </select>
          <span className="muted">
            {' '}{summary.weights.heatSinks} t · {conventional ? `${hs.required} needed by energy weapons` : `dissipates ${hs.dissipation}`} · {hs.free} free
          </span>
        </div>

        <label>Fuel</label>
        <div>
          <NumberField label="Fuel tons" value={design.fuelTons} min={0} step={0.5}
            onChange={(n) => update((d) => ({ ...d, fuelTons: Math.max(0, Math.round(n * 2) / 2) }))} />
          <span className="muted"> tons · {summary.fuelPoints} points ({FUEL_POINTS_PER_TON[design.fighterType]}/ton)</span>
        </div>

        <label>Troops / cargo</label>
        <div>
          <NumberField label="Troop and cargo space" value={design.cargo ?? 0} min={0} step={0.5}
            onChange={(n) => update((d) => ({ ...d, cargo: Math.max(0, Math.round(n * 2) / 2) || undefined }))} />
          <span className="muted"> tons (infantry compartment / cargo bay)</span>
        </div>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        {conventional
          ? 'Conventional fighters carry exactly the heat sinks their energy weapons need; ICE engines need power amplifiers for energy weapons.'
          : 'Five weapon slots per arc (nose, each wing, aft), less any taken by ferro-aluminum armor. Ammunition goes in the fuselage; wing weapons must match.'}
      </p>
    </section>
  );
}

function FighterArmorPanel({ design, summary, update }: Props) {
  const [tons, setTons] = useState(summary.weights.armor);
  useEffect(() => setTons(summary.weights.armor), [summary.weights.armor]);
  const ppt = summary.armorPointsPerTon;
  const maxTons = armorTonnage(summary.armorMax, ppt);
  const unused = armorPointsForTons(summary.weights.armor, ppt) - summary.armorTotal;
  const opt = (k: FighterArmorType) => componentAvailable(ARMOR_OPTIONS[k], design.era, design.techBase, design.mixedTech);
  const slotText = (k: FighterArmorType) => (FIGHTER_ARMOR_SLOTS[k] ? ` (${FIGHTER_ARMOR_SLOTS[k]} slot${FIGHTER_ARMOR_SLOTS[k] > 1 ? 's' : ''})` : '');
  return (
    <section className="panel">
      <h2>
        Armor{' '}
        <select aria-label="Armor type" value={design.armorType}
          onChange={(e) => update((d) => ({ ...d, armorType: e.target.value as FighterArmorType }))}>
          {(Object.keys(FIGHTER_ARMOR_NAMES) as FighterArmorType[]).map((k) => (
            <option key={k} value={k} disabled={k === 'primitive' ? design.cockpitType !== 'primitive' : k !== 'standard' && !opt(k)}>{FIGHTER_ARMOR_NAMES[k]}{slotText(k)}</option>
          ))}
        </select>{' '}
        <span className="muted small">{Number.isInteger(ppt) ? ppt : ppt.toFixed(2)} pts/ton</span>
      </h2>
      <table className="armor-table">
        <thead><tr><th>Arc</th><th>Armor</th><th>Threshold</th></tr></thead>
        <tbody>
          {FIGHTER_ARCS.map((l) => (
            <tr key={l}>
              <td>{FIGHTER_LOCATION_NAMES[l]}</td>
              <td>
                <NumberField label={`${FIGHTER_LOCATION_NAMES[l]} armor`} value={design.armor[l]} min={0} width="3.5rem"
                  onChange={(n) => update((d) => ({ ...d, armor: { ...d.armor, [l]: Math.max(0, Math.floor(n)) } }))} />
              </td>
              <td className="num muted">{armorThreshold(design.armor[l])}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
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
        <button onClick={() => update((d) => distributeFighterArmor(d, summary.armorMax))}>Maximize</button>
        <button onClick={() => update((d) => ({ ...d, armor: emptyFighterArmor() }))}>Clear</button>
        <span className="spacer" />
        <NumberField label="Armor tons" value={tons} min={0} max={maxTons} step={0.5} onChange={setTons} />
        <button onClick={() => update((d) => setFighterArmorTonnage(d, tons))}>Distribute tons</button>
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

/** Aerospace attack values by bracket, e.g. "5/5/–/–". */
function avText(eq: Equipment): string {
  const av = AERO_AV[eq.id];
  if (!av) return '—';
  return av.map((v) => (v ? String(v) : '–')).join('/');
}

function FighterEquipmentPanel({ design, summary, update }: Props) {
  const [tab, setTab] = useState<EquipmentCategory>('Energy');
  const available = ALL_EQUIPMENT.filter(
    (e) => isFighterEquipment(e) && isEquipmentAvailable(e, design.era, design.techBase, design.mixedTech),
  );
  const tabs = TABS.filter((x) => available.some((e) => e.category === x.id || (x.id === 'Other' && e.category === 'Utility')));
  const active = tabs.some((x) => x.id === tab) ? tab : 'Energy';
  const catalog = available.filter((e) => e.category === active || (active === 'Other' && e.category === 'Utility'));
  const mountedIds = new Set(design.equipment.map((e) => e.equipmentId));
  const combat = active !== 'Ammo';
  return (
    <section className="panel">
      <h2>Equipment</h2>
      <div className="arc-slots">
        {FIGHTER_ARCS.map((l) => {
          const { used, capacity } = summary.slots[l];
          return (
            <span key={l} className={used > capacity ? 'bad' : used === capacity ? 'warn' : 'muted'}>
              {FIGHTER_LOCATION_NAMES[l]} {used}/{capacity}
            </span>
          );
        })}
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
              const tons = fighterItemWeight(eq, design);
              const tooHeavy = tons > summary.weights.free;
              return (
                <tr key={eq.id} className={eq.ammoFor && !mountedIds.has(eq.ammoFor) ? 'dim' : ''}>
                  <td>{equipmentName(eq, design)}</td>
                  {combat && <><td className="num">{eq.isWeapon ? avText(eq) : '—'}</td><td className="num">{eq.isWeapon ? eq.heat : 0}</td></>}
                  <td className="num">{tons}</td>
                  <td>
                    <button className="small" disabled={tooHeavy} title={tooHeavy ? 'Not enough free tonnage' : 'Add to fighter'}
                      onClick={() => update((d) => addFighterItem(d, eq.id))}>Add</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Mounted <span className="muted small">({design.equipment.length} items)</span></h3>
      {design.equipment.length === 0 && <p className="muted">Nothing mounted yet. Weapons go in an arc; ammunition in the fuselage.</p>}
      <ul className="mounted">
        {design.equipment.map((item) => {
          const eq = getEquipment(item.equipmentId);
          if (!eq) return null;
          const locs = fighterItemLocations(eq);
          const wing = item.location === 'LWG' || item.location === 'RWG';
          return (
            <li key={item.uid} className={item.location ? '' : 'unallocated'}>
              <span className="item-name">
                <strong style={{ fontWeight: 500 }}>{equipmentName(eq, design)}</strong>
                <span className="muted small">{fighterItemWeight(eq, design)} t{usesWeaponSlot(eq) ? ' · 1 slot' : ''}</span>
              </span>
              <span className="spacer" />
              <select aria-label={`${eq.name} location`} value={item.location ?? ''}
                onChange={(e) => update((d) => setFighterItemLocation(d, item.uid, (e.target.value || null) as FighterLocation | null))}>
                <option value="">— unallocated —</option>
                {locs.map((l) => <option key={l} value={l}>{FIGHTER_LOCATION_NAMES[l]}</option>)}
              </select>
              {eq.isWeapon && wing && (
                <label className="check small">
                  <input type="checkbox" checked={!!item.rear} onChange={(e) => update((d) => setFighterItemRear(d, item.uid, e.target.checked))} />
                  Rear
                </label>
              )}
              <button className="small danger" aria-label={`Remove ${eq.name}`}
                onClick={() => update((d) => removeFighterItem(d, item.uid))}>✕</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FighterSummaryPanel({ design, summary, issues }: Props) {
  const [copied, setCopied] = useState(false);
  const w = summary.weights;
  const conventional = design.fighterType === 'conventional';
  const rows: [string, number][] = [
    ['Engine', w.engine],
    [conventional ? 'Controls' : 'Cockpit', w.controls],
    ['Fuel', w.fuel],
    ['Heat sinks', w.heatSinks],
    ...(w.vstol ? [['VSTOL gear', w.vstol] as [string, number]] : []),
    ...(w.powerAmplifiers ? [['Power amplifiers', w.powerAmplifiers] as [string, number]] : []),
    ['Armor', w.armor],
    ['Weapons & equipment', w.equipment],
  ];
  const pct = Math.min(100, (w.total / Math.max(1, design.tonnage)) * 100);
  const errors = issues.filter((i) => i.severity === 'error');
  const bv = fighterBV(design);
  const cost = fighterCost(design);
  const readout = fighterReadout(design, summary, { bv: bv.total, cost: cost.total });
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
        <div><span className="muted">Thrust</span> {design.safeThrust}/{summary.maxThrust}</div>
        <div><span className="muted">Type</span> {FIGHTER_TYPE_NAMES[design.fighterType]}</div>
        <div><span className="muted">Weapon heat</span> {summary.weaponHeat}/{summary.heatSinks.dissipation}</div>
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
