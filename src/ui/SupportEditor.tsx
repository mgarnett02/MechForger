import { useState } from 'react';
import type { TechBase } from '../rules/types';
import { TECH_BASE_NAMES } from '../rules/types';
import { getEra, isAvailableIn } from '../rules/eras';
import type { Equipment, EquipmentCategory } from '../rules/equipment';
import { ALL_EQUIPMENT, equipmentName, getEquipment, isEquipmentAvailable } from '../rules/equipment';
import type { Issue } from '../rules/validation';
import type {
  SVArmorLocation, SVEngine, SVLocation, SVTransport, SVType, SupportSummary, SupportVehicleDesign, TechRating,
} from '../rules/support';
import {
  CHASSIS_MODS, SV_ENGINE_NAMES, SV_LOCATION_NAMES, SV_TYPES, SV_TYPE_ORDER, TECH_RATINGS, addSupportItem,
  barWeightPerPoint, distributeSupportArmor, isSupportEquipment, kgPerFuelPoint, needsFuel, setSupportType,
  supportReadout, svEngineMultiplier, svEnginesFor, svItemLocations, svItemWeight,
} from '../rules/support';
import { NumberField } from './NumberField';

interface Props {
  design: SupportVehicleDesign;
  summary: SupportSummary;
  issues: Issue[];
  update: (fn: (d: SupportVehicleDesign) => SupportVehicleDesign) => void;
}

const t = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

/** All panels for building a support vehicle. */
export function SupportEditor(props: Props) {
  return (
    <main className="layout">
      <div className="col">
        <SupportChassisPanel {...props} />
        <SupportArmorPanel {...props} />
      </div>
      <div className="col">
        <TransportPanel {...props} />
        <SupportEquipmentPanel {...props} />
      </div>
      <div className="col">
        <SupportSummaryPanel {...props} />
      </div>
    </main>
  );
}

function TechSelect({ label, value, onChange, disabledFor }: {
  label: string; value: TechRating; onChange: (v: TechRating) => void; disabledFor?: (r: TechRating) => boolean;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as TechRating)}>
      {TECH_RATINGS.map((r) => <option key={r} value={r} disabled={disabledFor?.(r)}>{r}</option>)}
    </select>
  );
}

function SupportChassisPanel({ design, summary, update }: Props) {
  const info = SV_TYPES[design.svType];
  const era = getEra(design.era);
  const advanced = isAvailableIn('3050', design.era);
  const small = summary.size === 'small';
  return (
    <section className="panel">
      <h2>Chassis</h2>
      <div className="form-grid">
        <label>Vehicle type</label>
        <div>
          <select aria-label="Support vehicle type" value={design.svType}
            onChange={(e) => update((d) => setSupportType(d, e.target.value as SVType))}>
            {SV_TYPE_ORDER.map((k) => <option key={k} value={k}>{SV_TYPES[k].name} (up to {SV_TYPES[k].largeMax} t)</option>)}
          </select>
        </div>

        <label>Tonnage</label>
        <div>
          <NumberField label="Tonnage" value={design.tonnage} min={0.001} max={info.largeMax} step={small ? 0.001 : 0.5}
            invalid={design.tonnage > info.largeMax}
            onChange={(n) => update((d) => ({ ...d, tonnage: n >= 5 ? Math.round(n * 2) / 2 : Math.round(n * 1000) / 1000 }))} />
          <span className="muted"> {summary.size} (medium up to {info.mediumMax} t)</span>
        </div>

        <label>Tech base</label>
        <div>
          <select aria-label="Tech base" value={design.techBase} disabled={(era?.techBases.length ?? 1) < 2}
            onChange={(e) => update((d) => ({ ...d, techBase: e.target.value as TechBase }))}>
            {(era?.techBases ?? ['IS']).map((tb) => <option key={tb} value={tb}>{TECH_BASE_NAMES[tb]}</option>)}
          </select>{' '}
          <label className="check">
            <input type="checkbox" checked={design.mixedTech} disabled={!advanced && !design.mixedTech}
              onChange={(e) => update((d) => ({ ...d, mixedTech: e.target.checked }))} /> Mixed tech
          </label>
        </div>

        <label>Structure tech</label>
        <div>
          <TechSelect label="Structure tech rating" value={design.structureTech} onChange={(v) => update((d) => ({ ...d, structureTech: v }))} />
          <span className="muted"> {summary.weights.structure} t</span>
        </div>

        <label>{info.aero ? 'Safe thrust' : 'Cruising MP'}</label>
        <div>
          <NumberField label="Cruising MP" value={design.cruiseMP} min={0}
            onChange={(n) => update((d) => ({ ...d, cruiseMP: Math.max(0, Math.round(n)) }))} />
          <span className="muted"> {info.aero ? 'Max thrust' : 'Flank'} {summary.flankMP}</span>
        </div>

        <label>Engine</label>
        <div>
          <select aria-label="Engine type" value={design.engineType}
            onChange={(e) => update((d) => ({ ...d, engineType: e.target.value as SVEngine }))}>
            {svEnginesFor(design.svType).map((k) => <option key={k} value={k}>{SV_ENGINE_NAMES[k]}</option>)}
          </select>{' '}
          <TechSelect label="Engine tech rating" value={design.engineTech}
            onChange={(v) => update((d) => ({ ...d, engineTech: v }))}
            disabledFor={(r) => design.engineType !== 'none' && svEngineMultiplier(design.engineType, r) === 0} />
          <span className="muted"> {summary.weights.engine} t</span>
        </div>

        <label>Fuel</label>
        <div>
          <NumberField label="Fuel tons" value={design.fuel} min={0} step={small ? 0.001 : 0.5}
            onChange={(n) => update((d) => ({ ...d, fuel: Math.max(0, n) }))} />
          <span className="muted">
            {' '}tons{needsFuel(design) ? '' : ' (not needed)'}
            {info.aero && needsFuel(design) && ` · ${Math.floor((design.fuel * 1000) / kgPerFuelPoint(design))} fuel points`}
          </span>
        </div>

        <label>Fire control</label>
        <div>
          <select aria-label="Fire control" value={design.fireControl}
            onChange={(e) => update((d) => ({ ...d, fireControl: e.target.value as SupportVehicleDesign['fireControl'] }))}>
            <option value="none">None</option>
            <option value="basic">Basic (5% of weapons)</option>
            <option value="advanced">Advanced (10% of weapons)</option>
          </select>
          <span className="muted"> {summary.weights.fireControl} t</span>
        </div>

        {!info.aero && (
          <>
            <label>Turret</label>
            <div>
              <label className="check">
                <input type="checkbox" checked={design.turret}
                  onChange={(e) => update((d) => ({
                    ...d, turret: e.target.checked,
                    armor: e.target.checked ? d.armor : { ...d.armor, TU: undefined },
                    equipment: e.target.checked ? d.equipment : d.equipment.map((x) => (x.location === 'TU' ? { ...x, location: null } : x)),
                  }))} /> Turret
              </label>
              {design.turret && <span className="muted"> {summary.weights.turret} t</span>}
            </div>
          </>
        )}
      </div>

      <h3>Chassis modifications</h3>
      <div className="mods">
        {CHASSIS_MODS.filter((m) => m.types.includes(design.svType)).map((m) => (
          <label key={m.id} className="check small" title={`Structure weight × ${m.multiplier}${m.smallOnly ? ' (small vehicles only)' : ''}`}>
            <input type="checkbox" checked={design.chassisMods.includes(m.id)} disabled={!!m.smallOnly && !small && !design.chassisMods.includes(m.id)}
              onChange={(e) => update((d) => ({
                ...d, chassisMods: e.target.checked ? [...d.chassisMods, m.id] : d.chassisMods.filter((x) => x !== m.id),
              }))} />
            {m.name} <span className="muted">×{m.multiplier}</span>
          </label>
        ))}
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>{info.description}</p>
    </section>
  );
}

function SupportArmorPanel({ design, summary, update }: Props) {
  const wpp = barWeightPerPoint(design.bar, design.armorTech);
  return (
    <section className="panel">
      <h2>
        Armor{' '}
        <select aria-label="BAR rating" value={design.bar} onChange={(e) => update((d) => ({ ...d, bar: Number(e.target.value) }))}>
          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((b) => (
            <option key={b} value={b} disabled={barWeightPerPoint(b, design.armorTech) === 0}>BAR {b}</option>
          ))}
        </select>{' '}
        <TechSelect label="Armor tech rating" value={design.armorTech} onChange={(v) => update((d) => ({ ...d, armorTech: v }))} />
        <span className="muted small"> {wpp ? `${Math.round(wpp * 1000)} kg/point` : 'not available'}</span>
      </h2>
      <table className="armor-table">
        <thead><tr><th>Location</th><th>Armor</th><th /></tr></thead>
        <tbody>
          {summary.armorLocations.map((l: SVArmorLocation) => (
            <tr key={l}>
              <td>{SV_LOCATION_NAMES[l]}</td>
              <td>
                <NumberField label={`${SV_LOCATION_NAMES[l]} armor`} value={design.armor[l] ?? 0} min={0} width="3.5rem"
                  onChange={(n) => update((d) => ({ ...d, armor: { ...d.armor, [l]: Math.max(0, Math.floor(n)) } }))} />
              </td>
              <td className="muted small">{l === 'RO' ? 'max 2' : ''}</td>
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
      <p className="muted small">{t(summary.weights.armor)} tons</p>
      <div className="row wrap">
        <button onClick={() => update((d) => distributeSupportArmor(d, summary.armorMax))}>Maximize</button>
        <button onClick={() => update((d) => ({ ...d, armor: {} }))}>Clear</button>
      </div>
    </section>
  );
}

const TRANSPORT_FIELDS: { key: keyof SVTransport; label: string; unit: string; step: number }[] = [
  { key: 'seats', label: 'Standard seats', unit: 'seats · 75 kg each', step: 1 },
  { key: 'pillionSeats', label: 'Pillion seats', unit: 'seats · 25 kg each', step: 1 },
  { key: 'ejectionSeats', label: 'Ejection seats', unit: 'seats · 100 kg each', step: 1 },
  { key: 'steerage', label: 'Steerage quarters', unit: 't · 5 t per person', step: 0.5 },
  { key: 'secondClass', label: '2nd class quarters', unit: 't · 7 t per person', step: 0.5 },
  { key: 'firstClass', label: '1st class quarters', unit: 't · 10 t per person', step: 0.5 },
  { key: 'crewQuarters', label: 'Crew quarters', unit: 't · 7 t per person', step: 0.5 },
  { key: 'cargo', label: 'Cargo space', unit: 't', step: 0.5 },
  { key: 'troops', label: 'Troop space', unit: 't', step: 0.5 },
];

function TransportPanel({ design, summary, update }: Props) {
  return (
    <section className="panel">
      <h2>Crew, passengers &amp; cargo</h2>
      <div className="form-grid">
        {TRANSPORT_FIELDS.map((f) => (
          <div key={f.key} style={{ display: 'contents' }}>
            <label>{f.label}</label>
            <div>
              <NumberField label={f.label} value={design.transport[f.key]} min={0} step={f.step}
                onChange={(n) => update((d) => ({ ...d, transport: { ...d.transport, [f.key]: Math.max(0, f.step === 1 ? Math.round(n) : n) } }))} />
              <span className="muted small"> {f.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Accommodations {t(summary.weights.accommodations)} t · cargo / troops {t(summary.weights.cargo)} t
      </p>
    </section>
  );
}

const TABS: { id: EquipmentCategory; label: string }[] = [
  { id: 'Energy', label: 'Energy' }, { id: 'Ballistic', label: 'Ballistic' }, { id: 'Missile', label: 'Missile' },
  { id: 'Ammo', label: 'Ammo' }, { id: 'Other', label: 'Equipment' }, { id: 'Utility', label: 'Utility' },
];

const rangeText = (eq: Equipment) => {
  if (!eq.range) return '—';
  const { min, short, medium, long } = eq.range;
  return `${min ? `(${min}) ` : ''}${short}/${medium}/${long || '—'}`;
};

function SupportEquipmentPanel({ design, summary, update }: Props) {
  const [tab, setTab] = useState<EquipmentCategory>('Utility');
  const available = ALL_EQUIPMENT.filter((e) => isSupportEquipment(e) && isEquipmentAvailable(e, design.era, design.techBase, design.mixedTech));
  const tabs = TABS.filter((x) => available.some((e) => e.category === x.id));
  const active = tabs.some((x) => x.id === tab) ? tab : tabs[0]?.id ?? 'Utility';
  const catalog = available.filter((e) => e.category === active);
  const combat = !['Ammo', 'Utility', 'Other'].includes(active);
  return (
    <section className="panel">
      <h2>Equipment</h2>
      {summary.size === 'small' && <p className="small muted">Small support vehicles can only carry infantry weapons, which MechForger does not model; utility equipment is fine.</p>}
      <div className="tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={active === x.id} className={active === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>{x.label}</button>
        ))}
      </div>
      <div className="table-scroll">
        <table className="catalog">
          <thead><tr><th>Name</th>{combat && <><th>Dmg</th><th>Range</th></>}<th>Tons</th><th /></tr></thead>
          <tbody>
            {catalog.map((eq) => (
              <tr key={eq.id}>
                <td>{equipmentName(eq, design)}</td>
                {combat && <><td className="num">{eq.damage ?? '—'}</td><td>{rangeText(eq)}</td></>}
                <td className="num">{t(svItemWeight(eq, design))}</td>
                <td><button className="small" disabled={svItemWeight(eq, design) > summary.weights.free}
                  onClick={() => update((d) => addSupportItem(d, eq.id))}>Add</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Mounted <span className="muted small">({design.equipment.length} items)</span></h3>
      <ul className="mounted">
        {design.equipment.map((item) => {
          const eq = getEquipment(item.equipmentId);
          if (!eq) return null;
          return (
            <li key={item.uid} className={item.location ? '' : 'unallocated'}>
              <span className="item-name">
                <strong style={{ fontWeight: 500 }}>{equipmentName(eq, design)}</strong>
                <span className="muted small">{t(svItemWeight(eq, design))} t</span>
              </span>
              <span className="spacer" />
              <select aria-label={`${eq.name} location`} value={item.location ?? ''}
                onChange={(e) => update((d) => ({ ...d, equipment: d.equipment.map((x) => (x.uid === item.uid ? { ...x, location: (e.target.value || null) as SVLocation | null } : x)) }))}>
                <option value="">— unallocated —</option>
                {svItemLocations(eq, design).map((l) => <option key={l} value={l}>{SV_LOCATION_NAMES[l]}</option>)}
              </select>
              <button className="small danger" aria-label={`Remove ${eq.name}`}
                onClick={() => update((d) => ({ ...d, equipment: d.equipment.filter((x) => x.uid !== item.uid) }))}>✕</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SupportSummaryPanel({ design, summary, issues }: Props) {
  const [copied, setCopied] = useState(false);
  const w = summary.weights;
  const rows: [string, number][] = ([
    ['Chassis / structure', w.structure], ['Engine', w.engine], ['Fuel', w.fuel], ['Armor', w.armor],
    ['Turret', w.turret], ['Fire control', w.fireControl], ['Power amplifiers', w.powerAmplifiers],
    ['Heat sinks', w.heatSinks], ['Accommodations', w.accommodations], ['Cargo / troops', w.cargo],
    ['Equipment', w.equipment],
  ] as [string, number][]).filter(([k, v]) => v !== 0 || ['Chassis / structure', 'Engine', 'Armor'].includes(k));
  const errors = issues.filter((i) => i.severity === 'error');
  const readout = supportReadout(design, summary);
  const pct = Math.min(100, (w.total / Math.max(0.001, design.tonnage)) * 100);
  return (
    <section className="panel">
      <h2>Summary</h2>
      <div className={`weight-bar ${w.free < 0 ? 'over' : ''}`}><div style={{ width: `${pct}%` }} /></div>
      <p className="weight-line">
        <strong>{t(w.total)}</strong> / {t(design.tonnage)} tons{' '}
        <span className={w.free < 0 ? 'bad' : 'muted'}>({w.free < 0 ? `${t(-w.free)} over` : `${t(w.free)} free`})</span>
      </p>
      <table className="weights"><tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{t(v)}</td></tr>)}</tbody></table>
      <div className="stats">
        <div><span className="muted">Move</span> {design.cruiseMP}/{summary.flankMP}</div>
        <div><span className="muted">Size</span> {summary.size}</div>
        <div><span className="muted">Tech</span> {design.structureTech}-{design.engineTech}-{design.armorTech}</div>
        <div><span className="muted">Armor</span> {summary.armorTotal}/{summary.armorMax} (BAR {design.bar})</div>
      </div>
      <p className="small muted">Battle Value and cost are not calculated for support vehicles.</p>
      <h3 id="validation">
        Validation{' '}
        {errors.length === 0 ? <span className="ok small">✓ legal design</span> : <span className="bad small">{errors.length} error{errors.length > 1 ? 's' : ''}</span>}
      </h3>
      <ul className="issues">{issues.map((i, n) => <li key={n} className={i.severity}>{i.message}</li>)}</ul>
      <h3>
        Technical readout{' '}
        <button className="small" onClick={() => navigator.clipboard?.writeText(readout).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {})}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </h3>
      <pre className="readout">{readout}</pre>
    </section>
  );
}
