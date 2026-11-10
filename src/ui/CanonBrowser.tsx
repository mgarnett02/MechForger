import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanonEntry } from '../data/canonFormat';
import { decodeFighter, decodeMech, decodeSupport, decodeVehicle } from '../data/canonFormat';
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
  if (unit === 'support') {
    const size = sizeClass({ svType: (k in SV_TYPES ? k : 'wheeled') as SVType, tonnage: t });
    return size[0].toUpperCase() + size.slice(1);
  }
  if (unit === 'fighter') return k === 'conventional' ? (t <= 15 ? 'Light' : t <= 30 ? 'Medium' : 'Heavy') : t <= 45 ? 'Light' : t <= 70 ? 'Medium' : 'Heavy';
  if (unit === 'mech') return t <= 35 ? 'Light' : t <= 55 ? 'Medium' : t <= 75 ? 'Heavy' : 'Assault';
  return t < 40 ? 'Light' : t < 60 ? 'Medium' : t < 80 ? 'Heavy' : t <= 100 ? 'Assault' : 'Super-heavy';
}

function kindLabel(k: string): string {
  if (k === 'mech') return 'BattleMech';
  if (k === 'quad') return 'Quad BattleMech';
  if (k === 'lam') return "Land-Air 'Mech";
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
  const [limit, setLimit] = useState(PAGE);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEntries(null);
    setSub('');
    const load = kind === 'fighter' ? import('../data/canon/fighters.json')
      : kind === 'support' ? import('../data/canon/support.json')
      : kind === 'vehicle' ? import('../data/canon/vehicles.json') : import('../data/canon/mechs.json');
    load.then((m) => setEntries(m.default as CanonEntry[]), (e) => setError(String(e)));
  }, [kind]);

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => setLimit(PAGE), [query, tech, era, cls, sub, legalOnly, kind]);

  /** Filter group for an entry: OmniMechs are grouped regardless of how many configurations they have. */
  const group = (k: string) => (k.startsWith('omni:') ? 'omni' : k.startsWith('quadomni:') ? 'quadomni' : k);
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
      const name = e.n.toLowerCase();
      return words.every((w) => name.includes(w));
    });
  }, [entries, query, tech, era, cls, sub, legalOnly, kind]);

  const open = (e: CanonEntry) => {
    onLoad(kind === 'fighter' ? decodeFighter(e.d) : kind === 'support' ? decodeSupport(e.d) : kind === 'vehicle' ? decodeVehicle(e.d) : decodeMech(e.d));
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
            {(kind === 'support' ? ['Small', 'Medium', 'Large'] : kind === 'fighter' ? ['Light', 'Medium', 'Heavy'] : ['Light', 'Medium', 'Heavy', 'Assault', ...(kind === 'vehicle' ? ['Super-heavy'] : [])]).map((c) => <option key={c}>{c}</option>)}
          </select>
          <select aria-label="Type" value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">All types</option>
            {subKinds.map((k) => <option key={k} value={k}>{k === 'omni' ? 'OmniMechs' : k === 'quadomni' ? 'Quad OmniMechs' : k === 'quad' ? 'Quad BattleMechs' : k === 'lam' ? "Land-Air 'Mechs" : kindLabel(k)}</option>)}
          </select>
          <label className="check small"><input type="checkbox" checked={legalOnly} onChange={(e) => setLegalOnly(e.target.checked)} /> Legal in MechForger only</label>
        </div>

        {error && <p className="bad">Could not load the unit list: {error}</p>}
        {!entries && !error && <p className="muted">Loading…</p>}
        {entries && (
          <>
            <p className="small muted" style={{ margin: '0.25rem 0' }}>
              {filtered.length.toLocaleString()} of {entries.length.toLocaleString()} units
            </p>
            <div className="canon-list">
              <table className="catalog">
                <thead>
                  <tr><th>Name</th><th>Type</th><th className="num">Tons</th><th>Tech</th><th>Era</th><th className="num">BV</th><th /></tr>
                </thead>
                <tbody>
                  {filtered.slice(0, limit).map((e) => (
                    <tr key={`${e.k}|${e.t}|${e.y}|${e.n}`} onDoubleClick={() => open(e)}>
                      <td>
                        {e.n}
                        {!e.w && <span className="canon-flag" title="Weight differs from the canon design under MechForger's tables"> ⚖</span>}
                        {!e.ok && <span className="canon-flag" title="Does not pass all of MechForger's construction checks"> ⚠</span>}
                      </td>
                      <td className="small">{kindLabel(e.k)}</td>
                      <td className="num">{e.t}</td>
                      <td>{e.tb === 'IS' ? 'IS' : 'Clan'}</td>
                      <td className="small">{e.y}</td>
                      <td className="num">{kind === 'support' ? '—' : e.bv.toLocaleString()}</td>
                      <td><button className="small" onClick={() => open(e)}>Load</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > limit && (
                <button className="canon-more" onClick={() => setLimit((l) => l + PAGE * 2)}>
                  Show more ({(filtered.length - limit).toLocaleString()} remaining)
                </button>
              )}
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
