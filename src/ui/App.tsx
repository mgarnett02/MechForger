import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MechDesign, TechBase } from '../rules/types';
import { TECH_BASE_NAMES } from '../rules/types';
import { computeMech } from '../rules/construction';
import { validate } from '../rules/validation';
import { newDesign } from '../rules/edit';
import { PRESETS } from '../data/canonical';
import { VEHICLE_PRESETS } from '../data/vehicles';
import type { EraId } from '../rules/eras';
import { getEra } from '../rules/eras';
import type { VehicleDesign } from '../rules/vehicle';
import { computeVehicle, isVehicle, newVehicle, validateVehicle } from '../rules/vehicle';
import { EraDialog } from './EraDialog';
import { StatusLight } from './StatusLight';
import type { ThemeChoice } from './theme';
import { applyTheme, loadTheme } from './theme';
import { ChassisPanel } from './ChassisPanel';
import { ArmorPanel } from './ArmorPanel';
import { EquipmentPanel } from './EquipmentPanel';
import { CritPanel } from './CritPanel';
import { SummaryPanel } from './SummaryPanel';
import { VehicleEditor } from './VehicleEditor';
import { PrintPreview } from './print/PrintPreview';
import { AboutDialog } from './AboutDialog';
import { CanonBrowser } from './CanonBrowser';
import type { AnyDesign, UnitType } from './storage';
import {
  deleteSaved, designKey, downloadJson, listSaved, loadCurrent, loadCurrentVehicle, loadUnit, parseAny,
  saveCurrent, saveCurrentVehicle, saveDesign, saveUnit,
} from './storage';

export function App() {
  const [unit, setUnit] = useState<UnitType>(() => loadUnit());
  const [design, setDesign] = useState<MechDesign>(() => loadCurrent() ?? newDesign());
  const [vehicle, setVehicle] = useState<VehicleDesign>(() => loadCurrentVehicle() ?? newVehicle());
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(() => listSaved());
  const [notice, setNotice] = useState<string | null>(null);
  // 'startup' = required choice before the main form; 'change' = reopened, can be cancelled.
  const [eraDialog, setEraDialog] = useState<'startup' | 'change' | null>('startup');
  const [theme, setTheme] = useState<ThemeChoice>(() => loadTheme());
  const [printing, setPrinting] = useState(false);
  const [about, setAbout] = useState(false);
  const [canon, setCanon] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => applyTheme(theme), [theme]);

  const summary = useMemo(() => computeMech(design), [design]);
  const mechIssues = useMemo(() => validate(design, summary), [design, summary]);
  const vSummary = useMemo(() => computeVehicle(vehicle), [vehicle]);
  const vIssues = useMemo(() => validateVehicle(vehicle, vSummary), [vehicle, vSummary]);

  useEffect(() => saveCurrent(design), [design]);
  useEffect(() => saveCurrentVehicle(vehicle), [vehicle]);
  useEffect(() => saveUnit(unit), [unit]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(id);
  }, [notice]);

  const update = useCallback((fn: (d: MechDesign) => MechDesign) => setDesign((d) => fn(d)), []);
  const updateVehicle = useCallback((fn: (d: VehicleDesign) => VehicleDesign) => setVehicle((d) => fn(d)), []);

  /** The design being edited, whichever kind it is. */
  const active: AnyDesign = unit === 'vehicle' ? vehicle : design;
  const issues = unit === 'vehicle' ? vIssues : mechIssues;
  const setName = (patch: { chassis?: string; model?: string }) =>
    unit === 'vehicle' ? updateVehicle((d) => ({ ...d, ...patch })) : update((d) => ({ ...d, ...patch }));

  const load = (d: AnyDesign) => {
    if (isVehicle(d)) {
      setVehicle(d);
      setUnit('vehicle');
    } else {
      setDesign(d);
      setUnit('mech');
    }
    setSelected(null);
  };

  const hasWork = (d: AnyDesign) =>
    d.equipment.some((e) => e.equipmentId !== 'heat-sink') || Object.values(d.armor).some((v) => v > 0);

  const chooseEra = (era: EraId, techBase: TechBase, chosen: UnitType) => {
    const current: AnyDesign = chosen === 'vehicle' ? vehicle : design;
    if (techBase === current.techBase) {
      if (chosen === 'vehicle') updateVehicle((d) => (d.era === era ? d : { ...d, era }));
      else update((d) => (d.era === era ? d : { ...d, era }));
      setUnit(chosen);
    } else {
      // Inner Sphere and Clan equipment can't be mixed, so switching tech base starts afresh.
      const ok = !hasWork(current) || eraDialog === 'startup' ||
        window.confirm(`Switching to ${TECH_BASE_NAMES[techBase]} starts a new design. Save the current one first if you want to keep it. Continue?`);
      if (!ok) return;
      load(chosen === 'vehicle' ? newVehicle(era, techBase) : newDesign(era, techBase));
    }
    setEraDialog(null);
  };
  const era = getEra(active.era);

  // Samples for the current unit type, era and tech base first.
  const presetGroups = useMemo(() => {
    type Entry = { key: string; era: EraId; techBase: TechBase; label: string };
    const list: Entry[] = unit === 'vehicle'
      ? VEHICLE_PRESETS.map((p) => ({ ...p, label: 'original sample vehicles' }))
      : PRESETS.map((p) => ({ ...p, label: p.canon ? 'canon' : 'original samples' }));
    const groups = new Map<string, Entry[]>();
    const matches = (p: Entry) => Number(p.era === active.era && p.techBase === active.techBase);
    for (const p of [...list].sort((a, b) => matches(b) - matches(a))) {
      const label = `${p.era} ${TECH_BASE_NAMES[p.techBase]} — ${p.label}`;
      groups.set(label, [...(groups.get(label) ?? []), p]);
    }
    return [...groups];
  }, [unit, active.era, active.techBase]);

  const loadPreset = (key: string) => {
    if (unit === 'vehicle') {
      const p = VEHICLE_PRESETS.find((x) => x.key === key);
      if (p) load(p.build());
    } else {
      const p = PRESETS.find((x) => x.key === key);
      if (p) load(p.build());
    }
  };

  const onImport = async (file: File) => {
    try {
      load(parseAny(JSON.parse(await file.text())));
      setNotice(`Imported ${file.name}`);
    } catch (e) {
      setNotice(`Import failed: ${(e as Error).message}`);
    }
  };

  const savedKeys = Object.keys(saved).sort();
  const savedOfKind = savedKeys.filter((k) => (unit === 'vehicle') === isVehicle(saved[k]));
  const savedOther = savedKeys.filter((k) => !savedOfKind.includes(k));

  return (
    <div className="app">
      {about && <AboutDialog onClose={() => setAbout(false)} />}
      {canon && <CanonBrowser unit={unit} onLoad={load} onClose={() => setCanon(false)} />}
      {printing && <PrintPreview design={active} onClose={() => setPrinting(false)} />}
      {eraDialog && (
        <EraDialog
          current={active.era}
          currentTechBase={active.techBase}
          onSelect={chooseEra}
          onCancel={eraDialog === 'change' ? () => setEraDialog(null) : undefined}
          theme={theme}
          onThemeChange={setTheme}
        />
      )}
      <header className="toolbar">
        <h1>
          MechForger{' '}
          <span className="muted small">
            {unit === 'vehicle' ? 'Vehicle · ' : ''}
            {era
              ? `${era.name} · ${active.mixedTech ? `Mixed tech (${TECH_BASE_NAMES[active.techBase]} chassis) · Advanced` : `${TECH_BASE_NAMES[active.techBase]} · ${era.rulesLevel}`} · ${era.year}`
              : active.era}
          </span>{' '}
          <button className="small" onClick={() => setEraDialog('change')}>Change era / unit</button>{' '}
          <button className="small" onClick={() => setAbout(true)}>About / Legal</button>
        </h1>
        <div className="row wrap">
          <StatusLight issues={issues} />
          <input aria-label="Chassis name" value={active.chassis} placeholder="Chassis"
            onChange={(e) => setName({ chassis: e.target.value })} />
          <input aria-label="Model" value={active.model} placeholder="Model" style={{ width: '7rem' }}
            onChange={(e) => setName({ model: e.target.value })} />
          <button onClick={() => load(unit === 'vehicle'
            ? newVehicle(vehicle.era, vehicle.techBase)
            : newDesign(design.era, design.techBase))}>New</button>
          <button onClick={() => setCanon(true)} title="Browse and load canon BattleMechs and vehicles">Canon units…</button>
          <select aria-label="Load a design" value="" onChange={(e) => {
            const [kind, key] = e.target.value.split(':', 2) as [string, string];
            if (kind === 'preset') loadPreset(key);
            if (kind === 'saved' && saved[key]) load(parseAny(saved[key]));
          }}>
            <option value="">Load…</option>
            {presetGroups.map(([label, presets]) => (
              <optgroup key={label} label={label}>
                {presets.map((p) => <option key={p.key} value={`preset:${p.key}`}>{p.key}</option>)}
              </optgroup>
            ))}
            {savedOfKind.length > 0 && (
              <optgroup label={unit === 'vehicle' ? 'Saved vehicles' : 'Saved mechs'}>
                {savedOfKind.map((k) => <option key={k} value={`saved:${k}`}>{k}</option>)}
              </optgroup>
            )}
            {savedOther.length > 0 && (
              <optgroup label={unit === 'vehicle' ? 'Saved mechs' : 'Saved vehicles'}>
                {savedOther.map((k) => <option key={k} value={`saved:${k}`}>{k}</option>)}
              </optgroup>
            )}
          </select>
          <button onClick={() => {
            saveDesign(active);
            setSaved(listSaved());
            setNotice(`Saved "${designKey(active)}" in this browser`);
          }}>Save</button>
          {saved[designKey(active)] && (
            <button onClick={() => {
              deleteSaved(designKey(active));
              setSaved(listSaved());
              setNotice(`Deleted saved "${designKey(active)}"`);
            }}>Delete saved</button>
          )}
          <button onClick={() => setPrinting(true)}
            title="Preview and print a record sheet (or save it as PDF)">Print record sheet</button>
          <button onClick={() => downloadJson(active)}>Export JSON</button>
          <button onClick={() => fileRef.current?.click()}>Import JSON</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = '';
            }} />
        </div>
        {notice && <div className="notice" role="status">{notice}</div>}
      </header>

      {unit === 'vehicle' ? (
        <VehicleEditor design={vehicle} summary={vSummary} issues={vIssues} update={updateVehicle} />
      ) : (
        <main className="layout">
          <div className="col">
            <ChassisPanel design={design} summary={summary} update={update} />
            <ArmorPanel design={design} summary={summary} update={update} />
          </div>
          <div className="col">
            <EquipmentPanel design={design} summary={summary} update={update}
              selected={selected} setSelected={setSelected} />
          </div>
          <div className="col">
            <SummaryPanel design={design} summary={summary} issues={mechIssues} />
          </div>
          <div className="col wide">
            <CritPanel design={design} summary={summary} update={update}
              selected={selected} setSelected={setSelected} />
          </div>
        </main>
      )}
    </div>
  );
}
