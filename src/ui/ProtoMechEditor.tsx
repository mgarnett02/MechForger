import { useState } from 'react';
import { getEra } from '../rules/eras';
import type { MMItem } from '../rules/mmEquipment';
import { getMM, has, mmAvailable, mmName, mmNum } from '../rules/mmEquipment';
import type { ProtoIssue, ProtoLocation, ProtoMechDesign, ProtoMotion, ProtoSummary } from '../rules/protomech';
import {
  PROTO_ARMOR_LOCATIONS, PROTO_LOCATIONS, PROTO_LOCATION_NAMES, PROTO_MAX_TONNAGE, PROTO_MIN_TONNAGE, PROTO_MOTION_NAMES,
  addProtoItem, isJumpJet, isSlotless, maximizeProtoArmor, protoAmmoFor, protoArmorTypes, protoEquipment, protoItemLabel,
  protoItemWeight, protoMaxArmor, protoMechBV, protoMechCost, protoMechReadout, removeProtoItem, setProtoJumpMP, updateProtoItem,
} from '../rules/protomech';
import { NumberField } from './NumberField';
import { ValueCard } from './ValueCard';

interface Props {
  design: ProtoMechDesign;
  summary: ProtoSummary;
  issues: ProtoIssue[];
  update: (fn: (d: ProtoMechDesign) => ProtoMechDesign) => void;
}

const tons = (t: number) => (t < 1 ? `${Math.round(t * 1000)} kg` : `${Math.round(t * 1000) / 1000} t`);

/** All panels for building a ProtoMech. */
export function ProtoMechEditor(props: Props) {
  return (
    <main className="layout">
      <div className="col">
        <ProtoChassisPanel {...props} />
        <ProtoArmorPanel {...props} />
      </div>
      <div className="col">
        <ProtoEquipmentPanel {...props} />
      </div>
      <div className="col">
        <ProtoSummaryPanel {...props} />
      </div>
    </main>
  );
}

function ProtoChassisPanel({ design, summary, update }: Props) {
  const era = getEra(design.era);
  const extended = design.equipment.some((e) => e.equipmentId === 'ExtendedJumpJetSystem');
  const booster = design.equipment.some((e) => has(getMM(e.equipmentId), 'F_MASC'));
  const toggle = (id: string, on: boolean) => update((d) => on
    ? addProtoItem(d, id, 'BD')
    : { ...d, equipment: d.equipment.filter((e) => e.equipmentId !== id) });
  return (
    <section className="panel">
      <h2>Chassis</h2>
      <div className="form-grid">
        <label>Tonnage</label>
        <div>
          <NumberField label="Tonnage" value={design.tonnage} min={PROTO_MIN_TONNAGE} max={PROTO_MAX_TONNAGE}
            onChange={(n) => update((d) => ({ ...d, tonnage: Math.min(PROTO_MAX_TONNAGE, Math.max(PROTO_MIN_TONNAGE, Math.round(n))) }))} />
          <span className="muted"> tons{summary.ultraheavy ? ' · ultraheavy' : ''} (2–9; 10–15 ultraheavy)</span>
        </div>

        <label>Configuration</label>
        <div>
          <select aria-label="Configuration" value={design.motion}
            onChange={(e) => update((d) => ({ ...d, motion: e.target.value as ProtoMotion }))}>
            {(['biped', 'quad', 'glider'] as ProtoMotion[]).map((m) => <option key={m} value={m}>{PROTO_MOTION_NAMES[m]}</option>)}
          </select>
        </div>

        <label>Tech base</label>
        <div className="row wrap">
          <span>Clan</span>
          <label className="check" title="An Inner Sphere design using Clan ProtoMech technology">
            <input type="checkbox" checked={design.techBase === 'IS'}
              onChange={(e) => update((d) => ({ ...d, techBase: e.target.checked ? 'IS' : 'Clan', mixedTech: e.target.checked }))} />
            Inner Sphere (mixed tech)
          </label>
        </div>

        <label>Options</label>
        <div className="row wrap">
          <label className="check" title="Interface cockpit for pilots without the ProtoMech implants">
            <input type="checkbox" checked={!!design.interfaceCockpit}
              onChange={(e) => update((d) => ({ ...d, interfaceCockpit: e.target.checked || undefined }))} />
            Interface cockpit
          </label>
          <label className="check" title="Myomer booster: running MP becomes twice walking MP">
            <input type="checkbox" checked={booster} onChange={(e) => toggle('CLMyomerBooster', e.target.checked)} />
            Myomer booster
          </label>
        </div>

        <label>Walking MP</label>
        <div>
          <NumberField label="Walking MP" value={design.walkMP} min={1} max={20}
            onChange={(n) => update((d) => ({ ...d, walkMP: Math.max(1, Math.round(n)) }))} />
          <span className="muted"> run {summary.runMP}{summary.boostedRunMP ? ` [${summary.boostedRunMP}]` : ''} · engine {summary.rating} · {tons(summary.weights.engine)}</span>
        </div>

        <label>Jump MP</label>
        <div className="row wrap">
          <NumberField label="Jump MP" value={summary.jumpMP} min={0} max={20}
            onChange={(n) => update((d) => setProtoJumpMP(d, n))} />
          <label className="check" title="Extended jump jets: double weight, jump up to running MP">
            <input type="checkbox" checked={extended} onChange={(e) => update((d) => setProtoJumpMP(d, summary.jumpMP, e.target.checked))} />
            Extended
          </label>
        </div>
      </div>
      {era && era.year < 3059 && <p className="bad small">ProtoMechs first appear in 3059.</p>}
    </section>
  );
}

function ProtoArmorPanel({ design, summary, update }: Props) {
  const types = protoArmorTypes();
  const armor = getMM(design.armorId);
  const locs = PROTO_ARMOR_LOCATIONS.filter((l) => protoMaxArmor(design, l) > 0 || design.armor[l] > 0);
  return (
    <section className="panel">
      <h2>
        Armor{' '}
        <select aria-label="Armor type" value={design.armorId} onChange={(e) => update((d) => ({ ...d, armorId: e.target.value }))}>
          {types.map((a) => (
            <option key={a.id} value={a.id} disabled={!mmAvailable(a, design.era, 'Clan', true)}>
              {mmName(a)}{mmNum(a.criticalSlots) ? ` (${a.criticalSlots} torso slot)` : ''}
            </option>
          ))}
        </select>
      </h2>
      <table className="weights">
        <thead><tr><th>Location</th><th>Structure</th><th>Armor</th><th className="num">Max</th></tr></thead>
        <tbody>
          {locs.map((l) => (
            <tr key={l}>
              <td>{PROTO_LOCATION_NAMES[l]}</td>
              <td className="num">{summary.structure[l]}</td>
              <td>
                <NumberField label={`${PROTO_LOCATION_NAMES[l]} armor`} value={design.armor[l]} min={0} max={protoMaxArmor(design, l)}
                  onChange={(n) => update((d) => ({ ...d, armor: { ...d.armor, [l]: Math.max(0, Math.round(n)) } }))} />
              </td>
              <td className="num">{protoMaxArmor(design, l)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="row wrap small">
        <span className={summary.armorTotal > summary.armorMaxTotal ? 'bad' : 'muted'}>
          {summary.armorTotal} / {summary.armorMaxTotal} points · {Math.round((armor?.weightPerPoint ?? 0.05) * 1000)} kg/pt · {tons(summary.weights.armor)}
        </span>
        <button className="small" onClick={() => update(maximizeProtoArmor)}>Maximize</button>
      </p>
    </section>
  );
}

const TABS: { id: string; label: string; test: (e: MMItem) => boolean }[] = [
  { id: 'energy', label: 'Energy', test: (e) => e.kind !== 'misc' && has(e, 'F_ENERGY') },
  { id: 'ballistic', label: 'Ballistic', test: (e) => e.kind !== 'misc' && has(e, 'F_BALLISTIC') && !has(e, 'F_MISSILE') },
  { id: 'missile', label: 'Missile', test: (e) => e.kind !== 'misc' && (has(e, 'F_MISSILE') || (!!e.ammoType && !has(e, 'F_BALLISTIC') && !has(e, 'F_ENERGY'))) },
  { id: 'other', label: 'Other weapons', test: (e) => e.kind !== 'misc' && !TABS.slice(0, 3).some((t) => t.test(e)) },
  { id: 'equipment', label: 'Equipment', test: (e) => e.kind === 'misc' && !isJumpJet(e) && !has(e, 'F_MASC') },
];

function ProtoEquipmentPanel({ design, summary, update }: Props) {
  const [tab, setTab] = useState('energy');
  const available = protoEquipment().filter((e) => (e.techBase === 'Both' || e.techBase === design.techBase || design.mixedTech)
    && mmAvailable(e, design.era, design.techBase, design.mixedTech));
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const catalog = available.filter(active.test).sort((a, b) => mmName(a).localeCompare(mmName(b)));
  const weapons = design.equipment.map((i) => getMM(i.equipmentId)).filter((e): e is MMItem => !!e && e.kind !== 'misc' && e.kind !== 'ammo' && !!e.ammoType);
  const ammoChoices = [...new Map(weapons.flatMap((w) => protoAmmoFor(w).slice(0, 1)).map((a) => [a.id, a])).values()];
  const shown = design.equipment.filter((i) => !isJumpJet(getMM(i.equipmentId)) && !has(getMM(i.equipmentId), 'F_MASC'));
  const slotLocs: ProtoLocation[] = PROTO_LOCATIONS.filter((l) => summary.slots[l].max > 0);
  return (
    <section className="panel">
      <h2>Equipment</h2>
      <div className="arc-slots">
        {slotLocs.map((l) => {
          const s = summary.slots[l];
          const bad = s.used > s.max || s.tons > s.maxTons + 1e-9;
          return (
            <span key={l} className={bad ? 'bad' : s.used === s.max ? 'warn' : 'muted'}>
              {PROTO_LOCATION_NAMES[l]} {s.used}/{s.max}{Number.isFinite(s.maxTons) ? ` · ${tons(s.tons)}/${tons(s.maxTons)}` : ''}
            </span>
          );
        })}
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={active.id === x.id} className={active.id === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>{x.label}</button>
        ))}
      </div>
      <div className="table-scroll">
        <table className="catalog">
          <thead><tr><th>Name</th><th>Damage</th><th>Range</th><th>Heat</th><th>Tons</th><th /></tr></thead>
          <tbody>
            {catalog.map((e) => (
              <tr key={e.id}>
                <td>{mmName(e)}</td>
                <td className="num">{typeof e.damage === 'number' ? e.damage : e.rackSize ? `${e.rackSize}×` : '—'}</td>
                <td className="num">{e.range ? e.range.slice(1, 4).join('/') : '—'}</td>
                <td className="num">{e.heat ?? 0}</td>
                <td className="num">{tons(protoItemWeight(design, { uid: '', equipmentId: e.id, location: null }, e))}</td>
                <td><button className="small" onClick={() => update((d) => addProtoItem(d, e.id))}>Add</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ammoChoices.length > 0 && (
        <p className="row wrap small">
          <span className="muted">Ammunition:</span>
          {ammoChoices.map((a) => <button key={a.id} className="small" onClick={() => update((d) => addProtoItem(d, a.id))}>+ {mmName(a)}</button>)}
        </p>
      )}

      <h3>Mounted <span className="muted small">({shown.length} items; jump jets and the myomer booster are set on the chassis)</span></h3>
      {shown.length === 0 && <p className="muted">Nothing mounted yet. Weapons go in the torso, the arms or the main gun; ammunition in the body.</p>}
      <ul className="mounted">
        {shown.map((item) => {
          const e = getMM(item.equipmentId);
          if (!e) return null;
          const slotless = isSlotless(e);
          return (
            <li key={item.uid} className={item.location ? '' : 'unallocated'}>
              <span className="item-name">
                <strong style={{ fontWeight: 500 }}>{protoItemLabel(item)}</strong>
                <span className="muted small">{tons(protoItemWeight(design, item, e))}</span>
              </span>
              <span className="spacer" />
              {!slotless && (
                <select aria-label={`${mmName(e)} location`} value={item.location ?? ''}
                  onChange={(ev) => update((d) => updateProtoItem(d, item.uid, { location: (ev.target.value || null) as ProtoLocation | null, ...(ev.target.value !== 'TO' ? { rear: undefined } : {}) }))}>
                  <option value="">— unplaced —</option>
                  {(['TO', 'RA', 'LA', 'MG'] as ProtoLocation[]).filter((l) => summary.slots[l].max > 0 || l === 'MG').map((l) => <option key={l} value={l}>{PROTO_LOCATION_NAMES[l]}</option>)}
                </select>
              )}
              {item.location === 'TO' && e.kind !== 'misc' && (
                <label className="check small">
                  <input type="checkbox" checked={!!item.rear} onChange={(ev) => update((d) => updateProtoItem(d, item.uid, { rear: ev.target.checked || undefined }))} />
                  Rear
                </label>
              )}
              {e.kind === 'ammo' && (
                <NumberField label="Shots" value={item.shots ?? 1} min={1} max={200}
                  onChange={(n) => update((d) => updateProtoItem(d, item.uid, { shots: Math.max(1, Math.round(n)) }))} />
              )}
              <button className="small danger" aria-label={`Remove ${mmName(e)}`} onClick={() => update((d) => removeProtoItem(d, item.uid))}>✕</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProtoSummaryPanel({ design, summary, issues }: Props) {
  const [copied, setCopied] = useState(false);
  const w = summary.weights;
  const rows: [string, number][] = [
    ['Internal structure', w.structure], ['Engine', w.engine], ['Cockpit', w.cockpit], [`Heat sinks (${summary.heatSinks})`, w.heatSinks],
    ['Armor', w.armor], ['Weapons & equipment', w.equipment],
  ];
  const pct = Math.min(100, (w.total / design.tonnage) * 100);
  const over = w.free < -1e-9;
  const errors = issues.filter((i) => i.severity === 'error');
  const bv = protoMechBV(design, summary);
  const cost = protoMechCost(design, summary);
  const readout = protoMechReadout(design, summary);
  return (
    <section className="panel">
      <h2>Summary</h2>
      <div className={`weight-bar ${over ? 'over' : ''}`} aria-label="Tonnage used"><div style={{ width: `${pct}%` }} /></div>
      <p className="weight-line">
        <strong>{tons(w.total)}</strong> / {design.tonnage} t{' '}
        <span className={over ? 'bad' : 'muted'}>({over ? `${tons(-w.free)} over` : `${tons(w.free)} free`})</span>
      </p>
      <table className="weights">
        <tbody>{rows.map(([label, v]) => <tr key={label}><td>{label}</td><td className="num">{tons(v)}</td></tr>)}</tbody>
      </table>
      <div className="stats">
        <div><span className="muted">Move</span> {design.walkMP}/{summary.runMP}{summary.boostedRunMP ? `[${summary.boostedRunMP}]` : ''}/{summary.jumpMP}</div>
        <div><span className="muted">Type</span> {PROTO_MOTION_NAMES[design.motion]}</div>
        <div><span className="muted">Armor</span> {summary.armorTotal}/{summary.armorMaxTotal}</div>
        <div><span className="muted">Engine</span> {summary.rating}</div>
      </div>
      <ValueCard bv={{ ...bv, approximate: false }} cost={{ ...cost, approximate: false }} />
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
