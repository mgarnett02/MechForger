import { useState } from 'react';
import type { TechBase } from '../rules/types';
import { TECH_BASE_NAMES } from '../rules/types';
import { getEra, isAvailableIn } from '../rules/eras';
import { getMM, has, mmAvailable, mmName, mmNum } from '../rules/mmEquipment';
import type { MMItem } from '../rules/mmEquipment';
import { ALL_EQUIPMENT, getEquipment, isEquipmentAvailable } from '../rules/equipment';
import type { InfantryDesign, InfantryIssue, InfantryMotion, InfantrySummary, Specialization } from '../rules/infantry';
import {
  BEASTS, INFANTRY_MOTION_NAMES, SPECIALIZATIONS, SPECIALIZATION_NAMES, armorKits, damageTable, infantryBV, infantryCost,
  infantryReadout, infantryTools, infantryWeapons, maxPlatoon, maxSecondary, maxSquadSize, maxSquads, newInfantryUid,
} from '../rules/infantry';
import { NumberField } from './NumberField';
import { ValueCard } from './ValueCard';

interface Props {
  design: InfantryDesign;
  summary: InfantrySummary;
  issues: InfantryIssue[];
  update: (fn: (d: InfantryDesign) => InfantryDesign) => void;
}

/** All panels for building a conventional infantry platoon. */
export function InfantryEditor(props: Props) {
  return (
    <main className="layout">
      <div className="col">
        <PlatoonPanel {...props} />
        <ArmorKitPanel {...props} />
      </div>
      <div className="col">
        <WeaponsPanel {...props} />
        <FieldGunPanel {...props} />
      </div>
      <div className="col">
        <InfantrySummaryPanel {...props} />
      </div>
    </main>
  );
}

const weaponLabel = (e: MMItem) => `${mmName(e)} — ${e.infantryDamage ?? 0} dmg, range ${e.infantryRange ?? 0}${(e.crew ?? 1) > 1 ? `, crew ${e.crew}` : ''}`;

function PlatoonPanel({ design, update }: Props) {
  const era = getEra(design.era);
  const advanced = isAvailableIn('3050', design.era);
  return (
    <section className="panel">
      <h2>Platoon</h2>
      <div className="form-grid">
        <label>Motive type</label>
        <div>
          <select aria-label="Motive type" value={design.motion}
            onChange={(e) => update((d) => ({ ...d, motion: e.target.value as InfantryMotion, beast: e.target.value === 'beast' ? d.beast ?? 'Horse' : undefined }))}>
            {(Object.keys(INFANTRY_MOTION_NAMES) as InfantryMotion[]).map((m) => <option key={m} value={m}>{INFANTRY_MOTION_NAMES[m]}</option>)}
          </select>
        </div>
        {design.motion === 'beast' && (
          <>
            <label>Beast</label>
            <div>
              <select aria-label="Beast mount" value={design.beast ?? ''} onChange={(e) => update((d) => ({ ...d, beast: e.target.value }))}>
                {BEASTS.map((b) => <option key={b.name} value={b.name}>{b.name} ({b.size.replace('-', ' ')}, {b.mp} MP)</option>)}
              </select>
            </div>
          </>
        )}

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
          <label className="check" title="Anti-'Mech training and gear (not for mechanized infantry): swarm and leg attacks">
            <input type="checkbox" checked={design.antiMek} onChange={(e) => update((d) => ({ ...d, antiMek: e.target.checked }))} />
            Anti-'Mech training
          </label>
        </div>

        <label>Squad size</label>
        <div>
          <NumberField label="Squad size" value={design.squadSize} min={1} max={maxSquadSize(design)}
            onChange={(n) => update((d) => ({ ...d, squadSize: Math.max(1, Math.round(n)) }))} />
          <span className="muted"> max {maxSquadSize(design)}</span>
        </div>

        <label>Squads</label>
        <div>
          <NumberField label="Squads" value={design.squads} min={1} max={maxSquads(design)}
            onChange={(n) => update((d) => ({ ...d, squads: Math.max(1, Math.round(n)) }))} />
          <span className="muted"> max {maxSquads(design)} · platoon up to {maxPlatoon(design)}</span>
        </div>
      </div>
      <h3>Specializations</h3>
      <div className="row wrap small">
        {SPECIALIZATIONS.map((sp) => (
          <label key={sp} className="check">
            <input type="checkbox" checked={design.specializations.includes(sp)}
              onChange={(e) => update((d) => ({ ...d, specializations: e.target.checked ? [...d.specializations, sp] : d.specializations.filter((x) => x !== sp) as Specialization[] }))} />
            {SPECIALIZATION_NAMES[sp]}
          </label>
        ))}
      </div>
    </section>
  );
}

function ArmorKitPanel({ design, update }: Props) {
  const kits = armorKits().filter((k) => k.techBase === 'Both' || k.techBase === design.techBase || design.mixedTech).sort((a, b) => mmName(a).localeCompare(mmName(b)));
  const tools = infantryTools().filter((t) => mmAvailable(t, design.era, design.techBase, design.mixedTech));
  return (
    <section className="panel">
      <h2>Armor kit</h2>
      <select aria-label="Armor kit" style={{ maxWidth: "100%" }} value={design.armorKit ?? ''} onChange={(e) => update((d) => ({ ...d, armorKit: e.target.value || null, customArmor: null }))}>
        <option value="">{design.customArmor ? 'Custom armor (from file)' : 'None'}</option>
        {kits.map((k) => (
          <option key={k.id} value={k.id} disabled={!mmAvailable(k, design.era, design.techBase, design.mixedTech)}>
            {mmName(k)} — divisor {k.damageDivisor ?? 1}{has(k, 'S_ENCUMBERING') ? ', encumbering' : ''}
          </option>
        ))}
      </select>
      <h3>Equipment</h3>
      <div className="row wrap small">
        {tools.map((t) => (
          <label key={t.id} className="check">
            <input type="checkbox" checked={design.tools.includes(t.id)}
              onChange={(e) => update((d) => ({ ...d, tools: e.target.checked ? [...d.tools, t.id] : d.tools.filter((x) => x !== t.id) }))} />
            {mmName(t)}
          </label>
        ))}
      </div>
    </section>
  );
}

function WeaponsPanel({ design, update }: Props) {
  const available = infantryWeapons().filter((w) => mmAvailable(w, design.era, design.techBase, design.mixedTech)).sort((a, b) => mmName(a).localeCompare(mmName(b)));
  const primaries = available.filter((w) => !has(w, 'F_INF_SUPPORT'));
  const ensure = (list: MMItem[], id: string | null) => (id && !list.some((w) => w.id === id) && getMM(id) ? [getMM(id)!, ...list] : list);
  const table = damageTable(design);
  return (
    <section className="panel">
      <h2>Weapons</h2>
      <div className="form-grid">
        <label>Primary</label>
        <div>
          <select aria-label="Primary weapon" value={design.primary} onChange={(e) => update((d) => ({ ...d, primary: e.target.value }))}>
            {ensure(primaries, design.primary).map((w) => <option key={w.id} value={w.id}>{weaponLabel(w)}</option>)}
          </select>
        </div>
        <label>Secondary</label>
        <div>
          <select aria-label="Secondary weapon" value={design.secondary ?? ''}
            onChange={(e) => update((d) => ({ ...d, secondary: e.target.value || null, secondaryPerSquad: e.target.value ? Math.max(1, d.secondaryPerSquad) : 0 }))}>
            <option value="">None</option>
            {ensure(available, design.secondary).map((w) => <option key={w.id} value={w.id}>{weaponLabel(w)}</option>)}
          </select>
        </div>
        {design.secondary && (
          <>
            <label>Per squad</label>
            <div>
              <NumberField label="Secondary weapons per squad" value={design.secondaryPerSquad} min={0} max={maxSecondary(design)}
                onChange={(n) => update((d) => ({ ...d, secondaryPerSquad: Math.max(0, Math.round(n)) }))} />
              <span className="muted"> max {maxSecondary(design)}</span>
            </div>
          </>
        )}
      </div>
      <h3>Damage by troopers standing</h3>
      <div className="inf-damage">
        {table.map((v, i) => <span key={i}><b>{i + 1}</b>{v}</span>)}
      </div>
    </section>
  );
}

function FieldGunPanel({ design, update }: Props) {
  const [pick, setPick] = useState('');
  const guns = ALL_EQUIPMENT.filter((e) => e.isWeapon && (e.category === 'Ballistic' || e.category === 'Energy' || e.category === 'Missile')
    && !e.capitalClass && !e.melee && isEquipmentAvailable(e, design.era, design.techBase, design.mixedTech));
  const current = design.fieldGuns[0] ? getEquipment(design.fieldGuns[0].equipmentId) : null;
  return (
    <section className="panel">
      <h2>Field guns</h2>
      {design.fieldGuns.length === 0 && <p className="muted small">Optional: vehicle-scale weapons crewed by the platoon (all of one type; crew ≥ 2 or 1 per ton).</p>}
      {current && (
        <div className="form-grid">
          <label>Guns</label>
          <div>
            {current.name} ×{' '}
            <NumberField label="Field gun count" value={design.fieldGuns.length} min={0} max={10}
              onChange={(n) => update((d) => {
                const count = Math.max(0, Math.round(n));
                const first = d.fieldGuns[0];
                return { ...d, fieldGuns: Array.from({ length: count }, (_, i) => d.fieldGuns[i] ?? { ...first, uid: newInfantryUid() }) };
              })} />
          </div>
          <label>Ammo / gun</label>
          <div>
            <NumberField label="Ammunition tons per gun" value={design.fieldGuns[0].ammoTons ?? 0} min={0} max={10}
              onChange={(n) => update((d) => ({ ...d, fieldGuns: d.fieldGuns.map((g) => ({ ...g, ammoTons: Math.max(0, n) })) }))} />
            <span className="muted"> tons</span>
          </div>
        </div>
      )}
      <div className="row wrap" style={{ marginTop: 6 }}>
        <select aria-label="Field gun type" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose a weapon…</option>
          {guns.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.tons} t)</option>)}
        </select>
        <button className="small" disabled={!pick} onClick={() => update((d) => ({ ...d, fieldGuns: [{ uid: newInfantryUid(), equipmentId: pick, ammoTons: getEquipment(pick)?.ammoPerTon ? 1 : 0 }] }))}>
          {design.fieldGuns.length ? 'Replace' : 'Add'}
        </button>
        {design.fieldGuns.length > 0 && <button className="small danger" onClick={() => update((d) => ({ ...d, fieldGuns: [] }))}>Remove</button>}
      </div>
    </section>
  );
}

function InfantrySummaryPanel({ design, summary, issues }: Props) {
  const [copied, setCopied] = useState(false);
  const errors = issues.filter((i) => i.severity === 'error');
  const bv = infantryBV(design);
  const cost = infantryCost(design);
  const readout = infantryReadout(design);
  const mp = summary.mp;
  return (
    <section className="panel">
      <h2>Summary</h2>
      <p className="weight-line"><strong>{summary.troopers}</strong> troopers · <strong>{summary.weight}</strong> tons</p>
      <div className="stats">
        <div><span className="muted">Move</span> {mp.walk}{mp.jump ? ` / ${mp.jump} ${design.motion === 'jump' ? 'jump' : 'VTOL'}` : ''}{mp.umu ? ` / ${mp.umu} UMU` : ''}</div>
        <div><span className="muted">Damage</span> {summary.damagePerTrooper.toFixed(2)} / trooper</div>
        <div><span className="muted">Divisor</span> {summary.damageDivisor}{summary.encumbering ? ' (encumbering)' : ''}</div>
        <div><span className="muted">Anti-'Mech</span> {summary.canAntiMek ? (design.antiMek ? 'trained' : 'untrained') : 'no'}</div>
        {summary.fieldGunCrew > 0 && <div><span className="muted">Gun crew</span> {summary.fieldGunCrew}</div>}
        <div><span className="muted">Kit cost</span> {design.armorKit ? mmNum(getMM(design.armorKit)?.cost).toLocaleString('en-US') : '—'}</div>
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
