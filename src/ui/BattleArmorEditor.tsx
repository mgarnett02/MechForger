import { useState } from 'react';
import type { TechBase } from '../rules/types';
import { TECH_BASE_NAMES } from '../rules/types';
import { getEra, isAvailableIn } from '../rules/eras';
import type { MMItem } from '../rules/mmEquipment';
import { MM_EQUIPMENT, getMM, has, mmAvailable, mmName, mmNum } from '../rules/mmEquipment';
import type { BAChassis, BAIssue, BAMotion, BAMount, BASummary, BAWeightClass, BattleArmorDesign } from '../rules/battlearmor';
import {
  BA_MOTION_NAMES, BA_MOUNTS, BA_MOUNT_NAMES, BA_WEIGHT_CLASS_NAMES, BA_WEIGHT_LIMITS, addAPWeapon, addBAItem, ammoFor,
  baArmorTypes, baItemLabel, baItemSlots, baItemWeight, battleArmorBV, battleArmorCost, battleArmorReadout, isAPMount,
  isBAEquipment, isManipulator, removeBAItem, setBAArmorType, setBATechBase, syncArmorSlots, updateBAItem,
} from '../rules/battlearmor';
import { NumberField } from './NumberField';
import { ValueCard } from './ValueCard';

interface Props {
  design: BattleArmorDesign;
  summary: BASummary;
  issues: BAIssue[];
  update: (fn: (d: BattleArmorDesign) => BattleArmorDesign) => void;
}

const kg = (t: number) => `${Math.round(t * 1000)} kg`;

/** All panels for building a battle armor squad. */
export function BattleArmorEditor(props: Props) {
  return (
    <main className="layout">
      <div className="col">
        <BAChassisPanel {...props} />
        <BAArmorPanel {...props} />
      </div>
      <div className="col">
        <BAEquipmentPanel {...props} />
      </div>
      <div className="col">
        <BASummaryPanel {...props} />
      </div>
    </main>
  );
}

function BAChassisPanel({ design, summary, update }: Props) {
  const era = getEra(design.era);
  const advanced = isAvailableIn('3050', design.era);
  const motions: BAMotion[] = ['leg', 'jump', 'vtol', 'umu'];
  return (
    <section className="panel">
      <h2>Chassis</h2>
      <div className="form-grid">
        <label>Weight class</label>
        <div>
          <select aria-label="Weight class" value={design.weightClass}
            onChange={(e) => update((d) => syncArmorSlots({ ...d, weightClass: Number(e.target.value) as BAWeightClass }))}>
            {BA_WEIGHT_CLASS_NAMES.map((n, i) => <option key={n} value={i}>{n} (up to {kg(BA_WEIGHT_LIMITS[i])})</option>)}
          </select>
        </div>

        <label>Chassis</label>
        <div>
          <select aria-label="Chassis type" value={design.chassisType}
            onChange={(e) => update((d) => syncArmorSlots({ ...d, chassisType: e.target.value as BAChassis }))}>
            <option value="biped">Biped (arms and manipulators)</option>
            <option value="quad">Quad (no arms; turret possible)</option>
          </select>
        </div>

        {design.chassisType === 'quad' && (
          <>
            <label>Turret</label>
            <div className="row wrap">
              <NumberField label="Turret slots" value={design.turret?.size ?? 0} min={0} max={6}
                onChange={(n) => update((d) => ({ ...d, turret: n > 0 ? { size: Math.round(n), modular: d.turret?.modular ?? false } : null }))} />
              <label className="check">
                <input type="checkbox" checked={!!design.turret?.modular} disabled={!design.turret?.size}
                  onChange={(e) => update((d) => ({ ...d, turret: d.turret ? { ...d.turret, modular: e.target.checked } : null }))} />
                Modular
              </label>
            </div>
          </>
        )}

        <label>Tech base</label>
        <div>
          <select aria-label="Tech base" value={design.techBase} disabled={(era?.techBases.length ?? 1) < 2}
            onChange={(e) => update((d) => setBATechBase(d, e.target.value as TechBase))}>
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
          <label className="check" title="An exoskeleton: unarmored or lightly armored industrial suit">
            <input type="checkbox" checked={!!design.exoskeleton} onChange={(e) => update((d) => ({ ...d, exoskeleton: e.target.checked }))} />
            Exoskeleton
          </label>
        </div>

        <label>Squad size</label>
        <div>
          <NumberField label="Squad size" value={design.squadSize} min={1} max={6}
            onChange={(n) => update((d) => ({ ...d, squadSize: Math.min(6, Math.max(1, Math.round(n))) }))} />
          <span className="muted"> troopers (IS squads 4, Clan points 5, ComStar 6)</span>
        </div>

        <label>Ground MP</label>
        <div>
          <NumberField label="Ground MP" value={design.walkMP} min={1} max={summary.maxWalk}
            onChange={(n) => update((d) => ({ ...d, walkMP: Math.max(1, Math.round(n)) }))} />
          <span className="muted"> max {summary.maxWalk} · {kg(summary.weights.groundMP)}</span>
        </div>

        <label>Movement</label>
        <div>
          <select aria-label="Movement type" value={design.motion}
            onChange={(e) => update((d) => ({ ...d, motion: e.target.value as BAMotion, jumpMP: e.target.value === 'leg' ? 0 : d.jumpMP }))}>
            {motions.map((m) => <option key={m} value={m}>{BA_MOTION_NAMES[m]}</option>)}
          </select>
        </div>

        {design.motion !== 'leg' && (
          <>
            <label>{BA_MOTION_NAMES[design.motion]} MP</label>
            <div>
              <NumberField label={`${BA_MOTION_NAMES[design.motion]} MP`} value={design.jumpMP} min={0} max={summary.maxJump}
                onChange={(n) => update((d) => ({ ...d, jumpMP: Math.max(0, Math.round(n)) }))} />
              <span className="muted"> max {summary.maxJump} · {kg(summary.weights.motive)}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function BAArmorPanel({ design, summary, update }: Props) {
  const types = baArmorTypes().filter((a) => a.techBase === 'Both' || a.techBase === design.techBase || design.mixedTech);
  const armor = getMM(design.armorId);
  return (
    <section className="panel">
      <h2>
        Armor{' '}
        <select aria-label="Armor type" value={design.armorId} onChange={(e) => update((d) => setBAArmorType(d, e.target.value))}>
          {types.map((a) => (
            <option key={a.id} value={a.id} disabled={!mmAvailable(a, design.era, a.techBase === 'Both' ? design.techBase : a.techBase, design.mixedTech)}>
              {mmName(a)}{design.mixedTech && a.techBase !== 'Both' ? ` (${a.techBase === 'Clan' ? 'Clan' : 'IS'})` : ''}
              {mmNum(a.criticalSlots) ? ` (${a.criticalSlots} slots)` : ''}
            </option>
          ))}
        </select>
      </h2>
      <div className="form-grid">
        <label>Points / trooper</label>
        <div>
          <NumberField label="Armor points per trooper" value={design.armor} min={0} max={summary.maxArmor}
            onChange={(n) => update((d) => ({ ...d, armor: Math.max(0, Math.round(n)) }))} />
          <span className="muted"> max {summary.maxArmor} · {Math.round((armor?.weightPerPoint ?? 0) * 1000)} kg/pt · {kg(summary.weights.armor)}</span>
        </div>
      </div>
      <p className="muted small">
        Every trooper also has one point of internal structure. Armor that takes slots is listed as mounted items you can move between locations.
      </p>
    </section>
  );
}

const TABS: { id: string; label: string; test: (e: MMItem) => boolean }[] = [
  { id: 'energy', label: 'Energy', test: (e) => e.kind === 'baWeapon' && (has(e, 'F_ENERGY') || has(e, 'F_LASER') || has(e, 'F_FLAMER') || has(e, 'F_PLASMA')) },
  { id: 'ballistic', label: 'Ballistic', test: (e) => e.kind === 'baWeapon' && has(e, 'F_BALLISTIC') && !has(e, 'F_MISSILE') },
  { id: 'missile', label: 'Missile', test: (e) => e.kind === 'baWeapon' && (has(e, 'F_MISSILE') || !!e.ammoType && !has(e, 'F_BALLISTIC') && !has(e, 'F_ENERGY')) },
  { id: 'other-weapons', label: 'Other weapons', test: (e) => e.kind === 'baWeapon' && !TABS.slice(0, 3).some((t) => t.test(e)) },
  { id: 'manipulators', label: 'Manipulators', test: (e) => isManipulator(e) },
  { id: 'equipment', label: 'Equipment', test: (e) => e.kind === 'misc' && !isManipulator(e) },
];

function BAEquipmentPanel({ design, summary, update }: Props) {
  const [tab, setTab] = useState('energy');
  const available = MM_EQUIPMENT.filter((e) => isBAEquipment(e) && mmAvailable(e, design.era, design.techBase, design.mixedTech));
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const catalog = available.filter(active.test).sort((a, b) => mmName(a).localeCompare(mmName(b)));
  const mounts = BA_MOUNTS.filter((m) => summary.slots[m].capacity > 0 || design.equipment.some((i) => i.mount === m));
  const weapons = design.equipment.map((i) => getMM(i.equipmentId)).filter((e): e is MMItem => e?.kind === 'baWeapon' && !!e.ammoType);
  const ammoChoices = [...new Map(weapons.flatMap((w) => ammoFor(w).slice(0, 1)).map((a) => [a.id, a])).values()];
  const apWeapons = MM_EQUIPMENT.filter((e) => e.kind === 'infantryWeapon' && !has(e, 'F_INF_SUPPORT') && mmAvailable(e, design.era, design.techBase, design.mixedTech))
    .sort((a, b) => mmName(a).localeCompare(mmName(b)));
  return (
    <section className="panel">
      <h2>Equipment</h2>
      <div className="arc-slots">
        {mounts.map((m) => {
          const { used, capacity } = summary.slots[m];
          return <span key={m} className={used > capacity ? 'bad' : used === capacity ? 'warn' : 'muted'}>{BA_MOUNT_NAMES[m]} {used}/{capacity}</span>;
        })}
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={active.id === x.id} className={active.id === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>{x.label}</button>
        ))}
      </div>
      <div className="table-scroll">
        <table className="catalog">
          <thead><tr><th>Name</th><th>Damage</th><th>Range</th><th>kg</th><th>Slots</th><th /></tr></thead>
          <tbody>
            {catalog.map((e) => (
              <tr key={e.id}>
                <td>{mmName(e)}{design.mixedTech && e.techBase !== 'Both' ? ` (${e.techBase === 'Clan' ? 'C' : 'IS'})` : ''}</td>
                <td className="num">{damageText(e)}</td>
                <td className="num">{e.range ? e.range.slice(1, 4).join('/') : '—'}</td>
                <td className="num">{typeof e.tonnage === 'number' ? Math.round(e.tonnage * 1000) : 'var.'}</td>
                <td className="num">{isManipulator(e) ? '—' : mmNum(e.criticalSlots)}</td>
                <td><button className="small" onClick={() => update((d) => addBAItem(d, e.id))}>Add</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ammoChoices.length > 0 && (
        <p className="row wrap small">
          <span className="muted">Ammunition:</span>
          {ammoChoices.map((a) => <button key={a.id} className="small" onClick={() => update((d) => addBAItem(d, a.id))}>+ {mmName(a)}</button>)}
        </p>
      )}

      <h3>Mounted <span className="muted small">({design.equipment.length} items)</span></h3>
      {design.equipment.length === 0 && <p className="muted">Nothing mounted yet. Weapons and equipment go in the body or an arm.</p>}
      <ul className="mounted">
        {design.equipment.map((item) => {
          const e = getMM(item.equipmentId);
          if (!e) return null;
          const armorPiece = e.kind === 'baArmor';
          return (
            <li key={item.uid} className={item.mount || item.apm || item.dwp ? '' : 'unallocated'}>
              <span className="item-name">
                <strong style={{ fontWeight: 500 }}>{baItemLabel(item)}{armorPiece ? ' armor' : ''}</strong>
                <span className="muted small">{kg(baItemWeight(design, item, e))}{baItemSlots(item, e) ? ` · ${baItemSlots(item, e)} slot${baItemSlots(item, e) > 1 ? 's' : ''}` : ''}</span>
              </span>
              <span className="spacer" />
              {!item.apm && (
                <select aria-label={`${mmName(e)} location`} value={item.mount ?? ''}
                  onChange={(ev) => update((d) => updateBAItem(d, item.uid, { mount: (ev.target.value || null) as BAMount | null }))}>
                  <option value="">— unplaced —</option>
                  {(isManipulator(e) ? (['LA', 'RA'] as BAMount[]) : mounts).map((m) => <option key={m} value={m}>{BA_MOUNT_NAMES[m]}</option>)}
                </select>
              )}
              {e.kind === 'ammo' && (
                <NumberField label="Shots" value={item.shots ?? 1} min={1} max={e.ammoType === 'BA_TUBE' ? 16 : 8}
                  onChange={(n) => update((d) => updateBAItem(d, item.uid, { shots: Math.max(1, Math.round(n)) }))} />
              )}
              {e.kind === 'baWeapon' && design.chassisType === 'biped' && (
                <label className="check small" title="Squad support weapon mount: shared by the squad">
                  <input type="checkbox" checked={!!item.ssw} onChange={(ev) => update((d) => updateBAItem(d, item.uid, { ssw: ev.target.checked || undefined }))} />
                  SSW
                </label>
              )}
              {isAPMount(e) && (
                <select aria-label="Anti-personnel weapon" value=""
                  onChange={(ev) => ev.target.value && update((d) => addAPWeapon(d, item.uid, ev.target.value))}>
                  <option value="">+ AP weapon…</option>
                  {apWeapons.map((w) => <option key={w.id} value={w.id}>{mmName(w)}</option>)}
                </select>
              )}
              {!armorPiece && (
                <button className="small danger" aria-label={`Remove ${mmName(e)}`} onClick={() => update((d) => removeBAItem(d, item.uid))}>✕</button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function damageText(e: MMItem): string {
  if (e.damageShort) return `${e.damageShort}/${e.damageMedium}/${e.damageLong}`;
  if (typeof e.damage === 'number') return String(e.damage);
  if (e.rackSize && /cluster/.test(String(e.damage))) return `${e.rackSize} × ${/SRM/.test(e.ammoType ?? '') ? 2 : 1}`;
  return e.kind === 'baWeapon' ? 'special' : '—';
}

function BASummaryPanel({ design, summary, issues }: Props) {
  const [copied, setCopied] = useState(false);
  const w = summary.weights;
  const rows: [string, number][] = [
    ['Chassis', w.chassis], ['Ground movement', w.groundMP], [BA_MOTION_NAMES[design.motion], w.motive],
    ['Armor', w.armor], ...(w.turret ? [['Turret', w.turret] as [string, number]] : []), ['Weapons & equipment', w.equipment],
  ];
  const pct = Math.min(100, (w.total / summary.trooperLimit) * 100);
  const over = w.total > summary.trooperLimit + 1e-9;
  const errors = issues.filter((i) => i.severity === 'error');
  const bv = battleArmorBV(design);
  const cost = battleArmorCost(design);
  const readout = battleArmorReadout(design);
  return (
    <section className="panel">
      <h2>Summary</h2>
      <div className={`weight-bar ${over ? 'over' : ''}`} aria-label="Trooper weight used"><div style={{ width: `${pct}%` }} /></div>
      <p className="weight-line">
        <strong>{kg(w.total)}</strong> / {kg(summary.trooperLimit)} per trooper{' '}
        <span className={over ? 'bad' : 'muted'}>({over ? `${kg(w.total - summary.trooperLimit)} over` : `${kg(summary.trooperLimit - w.total)} free`})</span>
      </p>
      <table className="weights">
        <tbody>{rows.map(([label, v]) => <tr key={label}><td>{label}</td><td className="num">{kg(v)}</td></tr>)}</tbody>
      </table>
      <div className="stats">
        <div><span className="muted">Move</span> {design.walkMP}{design.motion !== 'leg' ? ` / ${design.jumpMP} ${BA_MOTION_NAMES[design.motion].toLowerCase()}` : ''}</div>
        <div><span className="muted">Squad</span> {design.squadSize} × {BA_WEIGHT_CLASS_NAMES[design.weightClass]}</div>
        <div><span className="muted">Armor</span> {design.armor}/{summary.maxArmor} per trooper</div>
        <div><span className="muted">BV / trooper</span> {Math.round(bv.perTrooper)}</div>
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
