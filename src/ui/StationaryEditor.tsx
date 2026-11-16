import { useState } from 'react';
import type { TechBase } from '../rules/types';
import { TECH_BASE_NAMES } from '../rules/types';
import { getEra, isAvailableIn } from '../rules/eras';
import type { Equipment, EquipmentCategory } from '../rules/equipment';
import { ALL_EQUIPMENT, equipmentName, getEquipment, isEquipmentAvailable } from '../rules/equipment';
import type { StationaryDesign, StationaryIssue, StationaryKind, StationarySummary } from '../rules/stationary';
import {
  STATIONARY_KIND_NAMES, addStationaryItem, removeStationaryItem, setStationaryKind, stationaryBV, stationaryCost,
  stationaryItemLabel, stationaryItemWeight, stationaryReadout, updateStationaryItem,
} from '../rules/stationary';
import { NumberField } from './NumberField';
import { ValueCard } from './ValueCard';

interface Props {
  design: StationaryDesign;
  summary: StationarySummary;
  issues: StationaryIssue[];
  update: (fn: (d: StationaryDesign) => StationaryDesign) => void;
}

const t = (n: number) => String(Math.round(n * 1000) / 1000);

/** Gun emplacements and handheld weapons. */
export function StationaryEditor(props: Props) {
  return (
    <main className="layout">
      <div className="col">
        <StationaryBasicsPanel {...props} />
      </div>
      <div className="col">
        <StationaryEquipmentPanel {...props} />
      </div>
      <div className="col">
        <StationarySummaryPanel {...props} />
      </div>
    </main>
  );
}

function StationaryBasicsPanel({ design, summary, update }: Props) {
  const era = getEra(design.era);
  const handheld = design.kind === 'handheld';
  return (
    <section className="panel">
      <h2>Unit</h2>
      <div className="form-grid">
        <label>Kind</label>
        <div>
          <select aria-label="Kind" value={design.kind} onChange={(e) => update((d) => setStationaryKind(d, e.target.value as StationaryKind))}>
            {(['emplacement', 'handheld'] as StationaryKind[]).map((k) => <option key={k} value={k}>{STATIONARY_KIND_NAMES[k]}</option>)}
          </select>
        </div>

        <label>Tech base</label>
        <div className="row wrap">
          <select aria-label="Tech base" value={design.techBase} disabled={(era?.techBases.length ?? 1) < 2}
            onChange={(e) => update((d) => ({ ...d, techBase: e.target.value as TechBase }))}>
            {(era?.techBases ?? ['IS']).map((tb) => <option key={tb} value={tb}>{TECH_BASE_NAMES[tb]}</option>)}
          </select>
          <label className="check" title={isAvailableIn('3050', design.era) ? 'Mixed tech uses Advanced rules' : 'Available from the Clan Invasion era (3050)'}>
            <input type="checkbox" checked={design.mixedTech} disabled={!isAvailableIn('3050', design.era) && !design.mixedTech}
              onChange={(e) => update((d) => ({ ...d, mixedTech: e.target.checked }))} />
            Mixed tech
          </label>
        </div>

        {handheld ? (
          <>
            <label>Tonnage</label>
            <div>
              <NumberField label="Tonnage" value={design.tonnage} min={0.5} max={100} step={0.5}
                onChange={(n) => update((d) => ({ ...d, tonnage: Math.max(0.5, Math.round(n * 2) / 2) }))} />
              <span className="muted"> tons</span>
            </div>
            <label>Armor</label>
            <div>
              <NumberField label="Armor points" value={design.armor} min={0} max={400}
                onChange={(n) => update((d) => ({ ...d, armor: Math.max(0, Math.round(n)) }))} />
              <span className="muted"> points · 16 per ton · {t(summary.weights.armor)} t</span>
            </div>
          </>
        ) : (
          <>
            <label>Turret</label>
            <div>
              <label className="check">
                <input type="checkbox" checked={design.turret} onChange={(e) => update((d) => ({ ...d, turret: e.target.checked }))} />
                Weapons in a turret (fire in every direction)
              </label>
            </div>
          </>
        )}
      </div>
      <p className="muted small">
        {handheld
          ? "A handheld weapon is carried by a 'Mech with a working hand actuator. It holds up to six items (ammunition and weapon enhancements aside) or one melee weapon, one ammo bin per kind of ammunition bought by the shot, and one-ton heat sinks for the heat of its energy weapons."
          : "A gun emplacement is a building fitted with weapons. It has no armor or movement of its own: the building's construction factor protects it."}
      </p>
    </section>
  );
}

const TABS: { id: EquipmentCategory; label: string }[] = [
  { id: 'Energy', label: 'Energy' }, { id: 'Ballistic', label: 'Ballistic' }, { id: 'Missile', label: 'Missile' },
  { id: 'Ammo', label: 'Ammo' }, { id: 'Other', label: 'Equipment' },
];

const fits = (e: Equipment, kind: StationaryKind) => !e.managed && !e.spread && !e.capitalClass && !e.lamOnly && !e.vehicleOnly && !e.vesselOnly
  && (!e.variableWeight || e.variableWeight === 'targetingComputer') && e.category !== 'Physical' && e.category !== 'Utility'
  && (kind === 'emplacement' || !/searchlight/.test(e.id));

function StationaryEquipmentPanel({ design, update }: Props) {
  const [tab, setTab] = useState<EquipmentCategory>('Energy');
  const available = ALL_EQUIPMENT.filter((e) => fits(e, design.kind) && isEquipmentAvailable(e, design.era, design.techBase, design.mixedTech));
  const tabs = TABS.filter((x) => available.some((e) => e.category === x.id));
  const active = tabs.some((x) => x.id === tab) ? tab : 'Energy';
  const catalog = available.filter((e) => e.category === active);
  const mountedIds = new Set(design.equipment.map((e) => e.equipmentId));
  return (
    <section className="panel">
      <h2>Weapons &amp; equipment</h2>
      <div className="tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={active === x.id} className={active === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>{x.label}</button>
        ))}
      </div>
      <div className="table-scroll">
        <table className="catalog">
          <thead><tr><th>Name</th><th>Dmg</th><th>Heat</th><th>Range</th><th>Tons</th><th /></tr></thead>
          <tbody>
            {catalog.map((eq) => (
              <tr key={eq.id} className={eq.ammoFor && !mountedIds.has(eq.ammoFor) ? 'dim' : ''}>
                <td>{equipmentName(eq, design)}</td>
                <td className="num">{eq.damage ?? '—'}</td>
                <td className="num">{eq.isWeapon ? eq.heat : 0}</td>
                <td>{eq.range ? `${eq.range.min ? `(${eq.range.min}) ` : ''}${eq.range.short}/${eq.range.medium}/${eq.range.long || '—'}` : '—'}</td>
                <td className="num">{eq.category === 'Physical' ? '—' : t(eq.tons)}</td>
                <td><button className="small" onClick={() => update((d) => addStationaryItem(d, eq.id))}>Add</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Fitted <span className="muted small">({design.equipment.length} items)</span></h3>
      {design.equipment.length === 0 && <p className="muted">Nothing fitted yet.</p>}
      <ul className="mounted">
        {design.equipment.map((item) => {
          const eq = getEquipment(item.equipmentId);
          if (!eq) return null;
          return (
            <li key={item.uid}>
              <span className="item-name">
                <strong style={{ fontWeight: 500 }}>{stationaryItemLabel(design, item)}</strong>
                <span className="muted small">{t(stationaryItemWeight(design, item, eq))} t</span>
              </span>
              <span className="spacer" />
              {eq.category === 'Ammo' && design.kind === 'handheld' && (
                <NumberField label="Shots" value={item.shots ?? 1} min={1} max={1000}
                  onChange={(n) => update((d) => updateStationaryItem(d, item.uid, { shots: Math.max(1, Math.round(n)) }))} />
              )}
              <button className="small danger" aria-label={`Remove ${eq.name}`} onClick={() => update((d) => removeStationaryItem(d, item.uid))}>✕</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StationarySummaryPanel({ design, summary, issues }: Props) {
  const [copied, setCopied] = useState(false);
  const handheld = design.kind === 'handheld';
  const w = summary.weights;
  const errors = issues.filter((i) => i.severity === 'error');
  const bv = stationaryBV(design);
  const cost = stationaryCost(design);
  const readout = stationaryReadout(design, summary);
  const over = w.free < -1e-9;
  return (
    <section className="panel">
      <h2>Summary</h2>
      {handheld ? (
        <>
          <div className={`weight-bar ${over ? 'over' : ''}`} aria-label="Tonnage used"><div style={{ width: `${Math.min(100, (w.total / Math.max(0.5, design.tonnage)) * 100)}%` }} /></div>
          <p className="weight-line">
            <strong>{t(w.total)} t</strong> / {design.tonnage} t{' '}
            <span className={over ? 'bad' : 'muted'}>({over ? `${t(-w.free)} t over` : `${t(w.free)} t free`})</span>
          </p>
          <table className="weights">
            <tbody>
              <tr><td>Armor ({design.armor})</td><td className="num">{t(w.armor)}</td></tr>
              <tr><td>Heat sinks ({summary.heatSinks})</td><td className="num">{t(w.heatSinks)}</td></tr>
              <tr><td>Weapons &amp; equipment</td><td className="num">{t(w.equipment)}</td></tr>
            </tbody>
          </table>
          <div className="stats"><div><span className="muted">Items</span> {summary.itemCount} / 6</div></div>
        </>
      ) : (
        <p className="weight-line"><strong>{t(w.total)} t</strong> of weapons and equipment{design.turret ? ' in a turret' : ''}</p>
      )}
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
