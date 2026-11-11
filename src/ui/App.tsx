import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MechDesign, TechBase } from '../rules/types';
import { TECH_BASE_NAMES } from '../rules/types';
import { computeMech } from '../rules/construction';
import { validate } from '../rules/validation';
import { newDesign } from '../rules/edit';
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
import { SupportEditor } from './SupportEditor';
import type { SupportVehicleDesign } from '../rules/support';
import { computeSupport, newSupportVehicle, validateSupport } from '../rules/support';
import type { FighterDesign } from '../rules/fighter';
import { computeFighter, newFighter, validateFighter } from '../rules/fighter';
import { FighterEditor } from './FighterEditor';
import type { VesselDesign } from '../rules/vessel';
import { computeVessel, newVessel, validateVessel } from '../rules/vessel';
import { VesselEditor } from './VesselEditor';
import type { BattleArmorDesign } from '../rules/battlearmor';
import { computeBattleArmor, newBattleArmor, validateBattleArmor } from '../rules/battlearmor';
import { BattleArmorEditor } from './BattleArmorEditor';
import { PrintPreview } from './print/PrintPreview';
import { AboutDialog } from './AboutDialog';
import { CanonBrowser } from './CanonBrowser';
import type { AnyDesign, UnitType } from './storage';
import {
  clearLegacySaved, listLegacySaved, loadCurrent, loadCurrentBattleArmor, saveCurrentBattleArmor, loadCurrentFighter, loadCurrentSupport, loadCurrentVessel, loadCurrentVehicle, loadUnit,
  saveCurrent, saveCurrentFighter, saveCurrentSupport, saveCurrentVessel, saveCurrentVehicle, saveUnit, unitTypeOf,
} from './storage';
import { loadDesignFile, saveDesignFile, saveDesignFiles } from './designFiles';

export function App() {
  const [unit, setUnit] = useState<UnitType>(() => loadUnit());
  const [design, setDesign] = useState<MechDesign>(() => loadCurrent() ?? newDesign());
  const [vehicle, setVehicle] = useState<VehicleDesign>(() => loadCurrentVehicle() ?? newVehicle());
  const [support, setSupport] = useState<SupportVehicleDesign>(() => loadCurrentSupport() ?? newSupportVehicle());
  const [fighter, setFighter] = useState<FighterDesign>(() => loadCurrentFighter() ?? newFighter());
  const [vessel, setVessel] = useState<VesselDesign>(() => loadCurrentVessel() ?? newVessel());
  const [ba, setBA] = useState<BattleArmorDesign>(() => loadCurrentBattleArmor() ?? newBattleArmor());
  const [selected, setSelected] = useState<string | null>(null);
  const [legacy, setLegacy] = useState(() => Object.values(listLegacySaved()));
  const [notice, setNotice] = useState<string | null>(null);
  // 'startup' = required choice before the main form; 'change' = reopened, can be cancelled.
  const [eraDialog, setEraDialog] = useState<'startup' | 'change' | null>('startup');
  const [theme, setTheme] = useState<ThemeChoice>(() => loadTheme());
  const [printing, setPrinting] = useState(false);
  const [about, setAbout] = useState(false);
  const [canon, setCanon] = useState(false);
  useEffect(() => applyTheme(theme), [theme]);

  const summary = useMemo(() => computeMech(design), [design]);
  const mechIssues = useMemo(() => validate(design, summary), [design, summary]);
  const vSummary = useMemo(() => computeVehicle(vehicle), [vehicle]);
  const vIssues = useMemo(() => validateVehicle(vehicle, vSummary), [vehicle, vSummary]);
  const sSummary = useMemo(() => computeSupport(support), [support]);
  const sIssues = useMemo(() => validateSupport(support, sSummary), [support, sSummary]);
  const fSummary = useMemo(() => computeFighter(fighter), [fighter]);
  const fIssues = useMemo(() => validateFighter(fighter, fSummary), [fighter, fSummary]);
  const vsSummary = useMemo(() => computeVessel(vessel), [vessel]);
  const vsIssues = useMemo(() => validateVessel(vessel, vsSummary), [vessel, vsSummary]);
  const baSummary = useMemo(() => computeBattleArmor(ba), [ba]);
  const baIssues = useMemo(() => validateBattleArmor(ba, baSummary), [ba, baSummary]);

  useEffect(() => saveCurrent(design), [design]);
  useEffect(() => saveCurrentVehicle(vehicle), [vehicle]);
  useEffect(() => saveCurrentSupport(support), [support]);
  useEffect(() => saveCurrentFighter(fighter), [fighter]);
  useEffect(() => saveCurrentVessel(vessel), [vessel]);
  useEffect(() => saveCurrentBattleArmor(ba), [ba]);
  useEffect(() => saveUnit(unit), [unit]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(id);
  }, [notice]);

  const update = useCallback((fn: (d: MechDesign) => MechDesign) => setDesign((d) => fn(d)), []);
  const updateVehicle = useCallback((fn: (d: VehicleDesign) => VehicleDesign) => setVehicle((d) => fn(d)), []);
  const updateSupport = useCallback((fn: (d: SupportVehicleDesign) => SupportVehicleDesign) => setSupport((d) => fn(d)), []);
  const updateFighter = useCallback((fn: (d: FighterDesign) => FighterDesign) => setFighter((d) => fn(d)), []);
  const updateVessel = useCallback((fn: (d: VesselDesign) => VesselDesign) => setVessel((d) => fn(d)), []);
  const updateBA = useCallback((fn: (d: BattleArmorDesign) => BattleArmorDesign) => setBA((d) => fn(d)), []);

  /** The design being edited, whichever kind it is. */
  const active: AnyDesign = unit === 'battlearmor' ? ba : unit === 'vessel' ? vessel : unit === 'fighter' ? fighter : unit === 'support' ? support : unit === 'vehicle' ? vehicle : design;
  const issues = unit === 'battlearmor' ? baIssues : unit === 'vessel' ? vsIssues : unit === 'fighter' ? fIssues : unit === 'support' ? sIssues : unit === 'vehicle' ? vIssues : mechIssues;
  const setName = (patch: { chassis?: string; model?: string }) =>
    unit === 'battlearmor' ? updateBA((d) => ({ ...d, ...patch }))
      : unit === 'vessel' ? updateVessel((d) => ({ ...d, ...patch }))
      : unit === 'fighter' ? updateFighter((d) => ({ ...d, ...patch }))
      : unit === 'support' ? updateSupport((d) => ({ ...d, ...patch }))
      : unit === 'vehicle' ? updateVehicle((d) => ({ ...d, ...patch })) : update((d) => ({ ...d, ...patch }));
  const newOf = (u: UnitType, era: EraId, tb: TechBase): AnyDesign =>
    u === 'battlearmor' ? newBattleArmor(era, tb) : u === 'vessel' ? newVessel(era, tb) : u === 'fighter' ? newFighter(era, tb) : u === 'support' ? newSupportVehicle(era, tb) : u === 'vehicle' ? newVehicle(era, tb) : newDesign(era, tb);

  const load = (d: AnyDesign) => {
    const kind = unitTypeOf(d);
    if (kind === 'battlearmor') {
      setBA(d as BattleArmorDesign);
      setUnit('battlearmor');
    } else if (kind === 'vessel') {
      setVessel(d as VesselDesign);
      setUnit('vessel');
    } else if (kind === 'fighter') {
      setFighter(d as FighterDesign);
      setUnit('fighter');
    } else if (kind === 'support') {
      setSupport(d as SupportVehicleDesign);
      setUnit('support');
    } else if (isVehicle(d)) {
      setVehicle(d);
      setUnit('vehicle');
    } else {
      setDesign(d as MechDesign);
      setUnit('mech');
    }
    setSelected(null);
  };

  const hasWork = (d: AnyDesign) =>
    d.equipment.some((e) => e.equipmentId !== 'heat-sink') || Object.values(d.armor).some((v) => v > 0);

  const chooseEra = (era: EraId, techBase: TechBase, chosen: UnitType) => {
    const current: AnyDesign = chosen === 'battlearmor' ? ba : chosen === 'vessel' ? vessel : chosen === 'fighter' ? fighter : chosen === 'support' ? support : chosen === 'vehicle' ? vehicle : design;
    if (techBase === current.techBase) {
      if (chosen === 'battlearmor') updateBA((d) => (d.era === era ? d : { ...d, era }));
      else if (chosen === 'vessel') updateVessel((d) => (d.era === era ? d : { ...d, era }));
      else if (chosen === 'fighter') updateFighter((d) => (d.era === era ? d : { ...d, era }));
      else if (chosen === 'support') updateSupport((d) => (d.era === era ? d : { ...d, era }));
      else if (chosen === 'vehicle') updateVehicle((d) => (d.era === era ? d : { ...d, era }));
      else update((d) => (d.era === era ? d : { ...d, era }));
      setUnit(chosen);
    } else {
      // Inner Sphere and Clan equipment can't be mixed, so switching tech base starts afresh.
      const ok = !hasWork(current) || eraDialog === 'startup' ||
        window.confirm(`Switching to ${TECH_BASE_NAMES[techBase]} starts a new design. Save the current one first if you want to keep it. Continue?`);
      if (!ok) return;
      load(newOf(chosen, era, techBase));
    }
    setEraDialog(null);
  };
  const era = getEra(active.era);

  const onSave = async () => {
    try {
      const name = await saveDesignFile(active);
      if (name) setNotice(`Saved ${name}`);
    } catch (e) {
      setNotice(`Save failed: ${(e as Error).message}`);
    }
  };

  const onLoad = async () => {
    try {
      const picked = await loadDesignFile();
      if (!picked) return;
      load(picked.design);
      setNotice(`Loaded ${picked.name}`);
    } catch (e) {
      setNotice(`Load failed: ${(e as Error).message}`);
    }
  };

  // Designs saved in browser storage by older versions: offer to write them out as files once.
  const onMoveLegacy = async () => {
    try {
      if (!(await saveDesignFiles(legacy))) return;
      clearLegacySaved();
      setNotice(`Saved ${legacy.length} older design${legacy.length === 1 ? '' : 's'} as files`);
      setLegacy([]);
    } catch (e) {
      setNotice(`Could not save older designs: ${(e as Error).message}`);
    }
  };

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
            {unit === 'vehicle' ? 'Vehicle · ' : unit === 'support' ? 'Support Vehicle · ' : unit === 'fighter' ? 'Fighter · ' : unit === 'vessel' ? 'Spacecraft · ' : unit === 'battlearmor' ? 'Battle Armor · ' : ''}
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
          <button onClick={() => load(newOf(unit, active.era, active.techBase))}>New</button>
          <button onClick={() => setCanon(true)} title="Browse and load canon BattleMechs, vehicles and fighters">Canon units…</button>
          <button onClick={() => void onLoad()} title="Open a design file (.json)">Load…</button>
          <button onClick={() => void onSave()} title="Save this design as its own .json file">Save…</button>
          {legacy.length > 0 && (
            <button onClick={() => void onMoveLegacy()}
              title="Designs saved inside the app by an earlier version. Save them as .json files so they can be loaded again.">
              Save older designs as files ({legacy.length})
            </button>
          )}
          <button onClick={() => setPrinting(true)}
            title="Preview and print a record sheet (or save it as PDF)">Print record sheet</button>
        </div>
        {notice && <div className="notice" role="status">{notice}</div>}
      </header>

      {unit === 'battlearmor' ? (
        <BattleArmorEditor design={ba} summary={baSummary} issues={baIssues} update={updateBA} />
      ) : unit === 'vessel' ? (
        <VesselEditor design={vessel} summary={vsSummary} issues={vsIssues} update={updateVessel} />
      ) : unit === 'fighter' ? (
        <FighterEditor design={fighter} summary={fSummary} issues={fIssues} update={updateFighter} />
      ) : unit === 'support' ? (
        <SupportEditor design={support} summary={sSummary} issues={sIssues} update={updateSupport} />
      ) : unit === 'vehicle' ? (
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
