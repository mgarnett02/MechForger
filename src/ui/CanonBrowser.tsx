import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanonEntry } from '../data/canonFormat';
import { decodeStationary, decodeProtoMech, decodeBattleArmor, decodeInfantry, decodeFighter, decodeMech, decodeSupport, decodeVehicle, decodeVessel } from '../data/canonFormat';
import { BA_MOTION_NAMES, BA_WEIGHT_CLASS_NAMES } from '../rules/battlearmor';
import type { BAMotion } from '../rules/battlearmor';
import { INFANTRY_MOTION_NAMES } from '../rules/infantry';
import type { InfantryMotion } from '../rules/infantry';
import { SV_TYPES, sizeClass } from '../rules/support';
import type { SVType } from '../rules/support';
import { ERAS } from '../rules/eras';
import { MOTIVE_TYPES } from '../rules/vehicle';
import type { AnyDesign, UnitType } from './storage';

interface Props {
  unit: UnitType;
  onLoad: (d: AnyDesign) => void;
  onClose: () => void;
}

const PAGE = 150;

function weightClass(t: number, unit: UnitType, k = ''): string {
  if (unit === 'stationary') return k === 'handheld' ? 'Handheld weapon' : 'Gun emplacement';
  if (unit === 'protomech') return t <= 4 ? 'Light' : t <= 7 ? 'Medium' : t <= 9 ? 'Heavy' : 'Ultraheavy';
  if (unit === 'battlearmor') return BA_WEIGHT_CLASS_NAMES[Number(k.split(':')[0])] ?? '';
  if (unit === 'infantry') return ['leg', 'jump', 'motorized', 'umu', 'motorized-umu', 'beast'].includes(k) ? 'Foot / jump / motorized' : 'Mechanized';
  if (unit === 'support') {
    const size = sizeClass({ svType: (k in SV_TYPES ? k : 'wheeled') as SVType, tonnage: t });
    return size[0].toUpperCase() + size.slice(1);
  }
  if (unit === 'vessel') {
    if (k.startsWith('small-craft')) return 'Small craft';
    if (k.startsWith('dropship')) return t < 2500 ? 'Small DropShip' : t < 10000 ? 'Medium DropShip' : 'Large DropShip';
    if (k.startsWith('jumpship')) return 'JumpShip';
    if (k.startsWith('space-station')) return 'Space station';
    return t < 500000 ? 'Light WarShip' : t < 1000000 ? 'Medium WarShip' : 'Heavy WarShip';
  }
  if (unit === 'fighter') return k === 'conventional' ? (t <= 15 ? 'Light' : t <= 30 ? 'Medium' : 'Heavy') : t <= 45 ? 'Light' : t <= 70 ? 'Medium' : 'Heavy';
  if (unit === 'mech') return t <= 35 ? 'Light' : t <= 55 ? 'Medium' : t <= 75 ? 'Heavy' : t <= 100 ? 'Assault' : 'Superheavy';
  return t < 40 ? 'Light' : t < 60 ? 'Medium' : t < 80 ? 'Heavy' : t <= 100 ? 'Assault' : 'Super-heavy';
}

function kindLabel(k: string): string {
  if (k in INFANTRY_MOTION_NAMES) return INFANTRY_MOTION_NAMES[k as InfantryMotion];
  const ba = /^(\d):(biped|quad):(\w+)$/.exec(k);
  if (ba) return `${BA_WEIGHT_CLASS_NAMES[Number(ba[1])]} ${ba[2]}${ba[3] === 'leg' ? '' : ` (${BA_MOTION_NAMES[ba[3] as BAMotion].toLowerCase()})`}`;
  if (k === 'emplacement') return 'Gun emplacement';
  if (k === 'handheld') return 'Handheld weapon';
  if (k === 'proto-biped') return 'ProtoMech';
  if (k === 'proto-quad') return 'Quad ProtoMech';
  if (k === 'proto-glider') return 'Glider ProtoMech';
  if (k === 'mech') return 'BattleMech';
  if (k === 'quad') return 'Quad BattleMech';
  if (k === 'lam') return "Land-Air 'Mech";
  if (k === 'tripod') return 'Tripod BattleMech';
  if (k === 'quadvee') return 'QuadVee';
  if (k === 'superheavy') return "Superheavy 'Mech";
  if (k.startsWith('tripodomni:')) return `Tripod OmniMech (${k.slice(11)} configs)`;
  if (k.startsWith('quadveeomni:')) return `OmniQuadVee (${k.slice(12)} configs)`;
  if (k.startsWith('small-craft:') || k.startsWith('dropship:')) {
    const [type, shape] = k.split(':');
    return `${shape === 'spheroid' ? 'Spheroid' : 'Aerodyne'} ${type === 'dropship' ? 'DropShip' : 'small craft'}`;
  }
  if (k.startsWith('jumpship')) return 'JumpShip';
  if (k.startsWith('warship')) return 'WarShip';
  if (k.startsWith('space-station')) return 'Space station';
  if (k === 'aerospace') return 'Aerospace fighter';
  if (k === 'omnifighter') return 'OmniFighter';
  if (k === 'conventional') return 'Conventional fighter';
  if (k.startsWith('omni:')) return `OmniMech (${k.slice(5)} configs)`;
  if (k.startsWith('quadomni:')) return `Quad OmniMech (${k.slice(9)} configs)`;
  if (k in SV_TYPES) return `${SV_TYPES[k as SVType].name} support`;
  return MOTIVE_TYPES[k as keyof typeof MOTIVE_TYPES]?.name ?? k;
}

/** Searchable list of bundled canon designs (converted from MegaMek Data). */
export function CanonBrowser({ unit, onLoad, onClose }: Props) {
  const [kind, setKind] = useState<UnitType>(unit);
  const [entries, setEntries] = useState<CanonEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tech, setTech] = useState('');
  const [era, setEra] = useState('');
  const [cls, setCls] = useState('');
  const [sub, setSub] = useState('');
  const [legalOnly, setLegalOnly] = useState(false);
  const [mulOnly, setMulOnly] = useState(false);
  // Weight-class groups: collapsed until opened (or while a search or filter narrows the list).
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [limits, setLimits] = useState<Record<string, number>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEntries(null);
    setSub('');
    const load = kind === 'stationary' ? import('../data/canon/stationary.json')
      : kind === 'protomech' ? import('../data/canon/protomechs.json')
      : kind === 'infantry' ? import('../data/canon/infantry.json')
      : kind === 'battlearmor' ? import('../data/canon/battlearmor.json')
      : kind === 'vessel' ? import('../data/canon/vessels.json')
      : kind === 'fighter' ? import('../data/canon/fighters.json')
      : kind === 'support' ? import('../data/canon/support.json')
      : kind === 'vehicle' ? import('../data/canon/vehicles.json') : import('../data/canon/mechs.json');
    // Ignore a list that arrives after the user has switched to another tab.
    let current = true;
    load.then((m) => current && setEntries(m.default as CanonEntry[]), (e) => current && setError(String(e)));
    return () => { current = false; };
  }, [kind]);

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => setLimits({}), [query, tech, era, cls, sub, legalOnly, mulOnly, kind]);
  useEffect(() => setOpenGroups(new Set()), [kind]);

  /** Filter group for an entry: OmniMechs are grouped regardless of how many configurations they have. */
  const group = (k: string) => (k.startsWith('omni:') ? 'omni' : k.startsWith('quadomni:') ? 'quadomni'
    : k.startsWith('tripodomni:') ? 'tripodomni' : k.startsWith('quadveeomni:') ? 'quadveeomni' : k);
  const subKinds = useMemo(() => [...new Set((entries ?? []).map((e) => group(e.k)))], [entries]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return entries.filter((e) => {
      if (tech && e.tb !== tech) return false;
      if (era && e.era !== era) return false;
      if (cls && weightClass(e.t, kind, e.k) !== cls) return false;
      if (sub && group(e.k) !== sub) return false;
      if (legalOnly && !e.ok) return false;
      if (mulOnly && !e.mul) return false;
      const name = e.n.toLowerCase();
      return words.every((w) => name.includes(w));
    });
  }, [entries, query, tech, era, cls, sub, legalOnly, mulOnly, kind]);

  /** The filtered units by weight class, lightest class first. */
  const groups = useMemo(() => {
    const by = new Map<string, CanonEntry[]>();
    for (const e of filtered) {
      const c = weightClass(e.t, kind, e.k) || 'Other';
      if (!by.has(c)) by.set(c, []);
      by.get(c)!.push(e);
    }
    const minT = (l: CanonEntry[]) => l.reduce((a, e) => Math.min(a, e.t), Infinity);
    return [...by].sort((a, b) => minT(a[1]) - minT(b[1]));
  }, [filtered, kind]);
  // A search, a weight-class filter or a short list shows every group open.
  const autoOpen = query.trim() !== '' || cls !== '' || filtered.length <= 40;
  const isOpen = (c: string) => autoOpen || openGroups.has(c);
  const toggle = (c: string) => setOpenGroups((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  const open = (e: CanonEntry) => {
    const d: AnyDesign = (kind === 'stationary' ? decodeStationary(e.d) : kind === 'protomech' ? decodeProtoMech(e.d) : kind === 'infantry' ? decodeInfantry(e.d) : kind === 'battlearmor' ? decodeBattleArmor(e.d) : kind === 'vessel' ? decodeVessel(e.d) : kind === 'fighter' ? decodeFighter(e.d) : kind === 'support' ? decodeSupport(e.d) : kind === 'vehicle' ? decodeVehicle(e.d) : decodeMech(e.d));
    onLoad(e.mul ? { ...d, mulId: e.mul } : d);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal canon" role="dialog" aria-modal="true" aria-labelledby="canon-title" onClick={(e) => e.stopPropagation()}>
        <div className="row wrap">
          <h2 id="canon-title" style={{ margin: 0 }}>Canon units</h2>
          <div className="segmented" role="radiogroup" aria-label="Unit type">
            <button role="radio" aria-checked={kind === 'mech'} className={kind === 'mech' ? 'active' : ''} onClick={() => setKind('mech')}>BattleMechs</button>
            <button role="radio" aria-checked={kind === 'vehicle'} className={kind === 'vehicle' ? 'active' : ''} onClick={() => setKind('vehicle')}>Vehicles</button>
            <button role="radio" aria-checked={kind === 'support'} className={kind === 'support' ? 'active' : ''} onClick={() => setKind('support')}>Support vehicles</button>
            <button role="radio" aria-checked={kind === 'fighter'} className={kind === 'fighter' ? 'active' : ''} onClick={() => setKind('fighter')}>Fighters</button>
            <button role="radio" aria-checked={kind === 'vessel'} className={kind === 'vessel' ? 'active' : ''} onClick={() => setKind('vessel')}>Spacecraft</button>
            <button role="radio" aria-checked={kind === 'battlearmor'} className={kind === 'battlearmor' ? 'active' : ''} onClick={() => setKind('battlearmor')}>Battle armor</button>
            <button role="radio" aria-checked={kind === 'protomech'} className={kind === 'protomech' ? 'active' : ''} onClick={() => setKind('protomech')}>ProtoMechs</button>
            <button role="radio" aria-checked={kind === 'stationary'} className={kind === 'stationary' ? 'active' : ''} onClick={() => setKind('stationary')}>Emplacements / handheld</button>
            <button role="radio" aria-checked={kind === 'infantry'} className={kind === 'infantry' ? 'active' : ''} onClick={() => setKind('infantry')}>Infantry</button>
          </div>
          <span className="spacer" />
          <button onClick={onClose}>Close</button>
        </div>

        <div className="canon-filters">
          <input ref={searchRef} type="search" placeholder="Search by name, e.g. “atlas” or “timber wolf prime”"
            aria-label="Search canon units" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select aria-label="Tech base" value={tech} onChange={(e) => setTech(e.target.value)}>
            <option value="">All tech</option><option value="IS">Inner Sphere</option><option value="Clan">Clan</option>
          </select>
          <select aria-label="Era" value={era} onChange={(e) => setEra(e.target.value)}>
            <option value="">All eras</option>
            {ERAS.map((x) => <option key={x.id} value={x.id}>{x.year} {x.name}</option>)}
          </select>
          <select aria-label="Weight class" value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="">All weights</option>
            {(kind === 'stationary' ? ['Gun emplacement', 'Handheld weapon'] : kind === 'protomech' ? ['Light', 'Medium', 'Heavy', 'Ultraheavy'] : kind === 'infantry' ? ['Foot / jump / motorized', 'Mechanized'] : kind === 'battlearmor' ? [...BA_WEIGHT_CLASS_NAMES] : kind === 'support' ? ['Small', 'Medium', 'Large'] : kind === 'fighter' ? ['Light', 'Medium', 'Heavy'] : kind === 'vessel' ? ['Small craft', 'Small DropShip', 'Medium DropShip', 'Large DropShip'] : ['Light', 'Medium', 'Heavy', 'Assault', ...(kind === 'vehicle' ? ['Super-heavy'] : [])]).map((c) => <option key={c}>{c}</option>)}
          </select>
          <select aria-label="Type" value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">All types</option>
            {subKinds.map((k) => <option key={k} value={k}>{k === 'omni' ? 'OmniMechs' : k === 'quadomni' ? 'Quad OmniMechs' : k === 'tripodomni' ? 'Tripod OmniMechs' : k === 'quadveeomni' ? 'OmniQuadVees' : k === 'quad' ? 'Quad BattleMechs' : k === 'lam' ? "Land-Air 'Mechs" : kindLabel(k)}</option>)}
          </select>
          <label className="check small"><input type="checkbox" checked={legalOnly} onChange={(e) => setLegalOnly(e.target.checked)} /> Legal in MechForger only</label>
          <label className="check small" title="Only units with a Master Unit List entry"><input type="checkbox" checked={mulOnly} onChange={(e) => setMulOnly(e.target.checked)} /> On the MUL only</label>
        </div>

        {error && <p className="bad">Could not load the unit list: {error}</p>}
        {!entries && !error && <p className="muted">Loading…</p>}
        {entries && (
          <>
            <p className="small muted row" style={{ margin: '0.25rem 0' }}>
              <span>{filtered.length.toLocaleString()} of {entries.length.toLocaleString()} units</span>
              {!autoOpen && groups.length > 1 && (
                <>
                  <button className="small" onClick={() => setOpenGroups(new Set(groups.map(([c]) => c)))}>Expand all</button>
                  <button className="small" onClick={() => setOpenGroups(new Set())}>Collapse all</button>
                </>
              )}
            </p>
            <div className="canon-list">
              <table className="catalog">
                <thead>
                  <tr><th>Name</th><th>Type</th><th className="num">{kind === 'battlearmor' ? 'kg/suit' : 'Tons'}</th><th>Tech</th><th>Era</th><th className="num">BV</th><th /></tr>
                </thead>
                {groups.map(([c, list]) => {
                  const shown = isOpen(c);
                  const limit = limits[c] ?? PAGE;
                  return (
                    <tbody key={c}>
                      <tr className="canon-group">
                        <th colSpan={7}>
                          <button className="canon-group-toggle" aria-expanded={shown} disabled={autoOpen} onClick={() => toggle(c)}>
                            <span aria-hidden="true">{shown ? '▾' : '▸'}</span> {c} <span className="muted">({list.length.toLocaleString()})</span>
                          </button>
                        </th>
                      </tr>
                      {shown && list.slice(0, limit).map((e) => (
                        <tr key={`${e.k}|${e.t}|${e.y}|${e.n}`} onDoubleClick={() => open(e)}>
                          <td>
                            {e.n}
                            {!e.w && <span className="canon-flag" title="Weight differs from the canon design under MechForger's tables"> ⚖</span>}
                            {!e.ok && <span className="canon-flag" title="Does not pass all of MechForger's construction checks"> ⚠</span>}
                            {!e.mul && <span className="canon-flag no-mul" title="No Master Unit List entry: a design built from the published rules, or one the MUL does not list"> no MUL</span>}
                          </td>
                          <td className="small">{kindLabel(e.k)}</td>
                          <td className="num">{kind === 'battlearmor' ? Math.round(e.t * 1000) : e.t}</td>
                          <td>{e.tb === 'IS' ? 'IS' : 'Clan'}</td>
                          <td className="small">{e.y}</td>
                          <td className="num">{e.bv.toLocaleString()}</td>
                          <td><button className="small" onClick={() => open(e)}>Load</button></td>
                        </tr>
                      ))}
                      {shown && list.length > limit && (
                        <tr><td colSpan={7}>
                          <button className="canon-more" onClick={() => setLimits((l) => ({ ...l, [c]: limit + PAGE * 2 }))}>
                            Show more {c.toLowerCase()} ({(list.length - limit).toLocaleString()} remaining)
                          </button>
                        </td></tr>
                      )}
                    </tbody>
                  );
                })}
              </table>
            </div>
          </>
        )}
        <p className="legal-note">
          Unit data from <b>MegaMek Data</b> by the MegaMek Development Team, licensed under CC BY-NC-SA 4.0
          (github.com/MegaMek/mm-data), converted for MechForger. BV is calculated by MechForger.
          ⚖ weight differs under MechForger's tables · ⚠ fails a MechForger construction check.
        </p>
      </div>
    </div>
  );
}
