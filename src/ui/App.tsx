import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MechDesign, TechBase } from '../rules/types';
import { TECH_BASE_NAMES } from '../rules/types';
import { computeMech } from '../rules/construction';
import { validate } from '../rules/validation';
import { newDesign, parseDesign } from '../rules/edit';
import { PRESETS } from '../data/canonical';
import type { EraId } from '../rules/eras';
import { getEra } from '../rules/eras';
import { EraDialog } from './EraDialog';
import { StatusLight } from './StatusLight';
import { ChassisPanel } from './ChassisPanel';
import { ArmorPanel } from './ArmorPanel';
import { EquipmentPanel } from './EquipmentPanel';
import { CritPanel } from './CritPanel';
import { SummaryPanel } from './SummaryPanel';
import {
  deleteSaved, designKey, downloadJson, listSaved, loadCurrent, saveCurrent, saveDesign,
} from './storage';

export function App() {
  const [design, setDesign] = useState<MechDesign>(() => loadCurrent() ?? newDesign());
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(() => listSaved());
  const [notice, setNotice] = useState<string | null>(null);
  // 'startup' = required choice before the main form; 'change' = reopened, can be cancelled.
  const [eraDialog, setEraDialog] = useState<'startup' | 'change' | null>('startup');
  const fileRef = useRef<HTMLInputElement>(null);

  const summary = useMemo(() => computeMech(design), [design]);
  const issues = useMemo(() => validate(design, summary), [design, summary]);

  useEffect(() => saveCurrent(design), [design]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(id);
  }, [notice]);

  const update = useCallback((fn: (d: MechDesign) => MechDesign) => setDesign((d) => fn(d)), []);
  const load = (d: MechDesign) => {
    setDesign(d);
    setSelected(null);
  };

  const chooseEra = (era: EraId, techBase: TechBase) => {
    if (techBase === design.techBase) {
      update((d) => (d.era === era ? d : { ...d, era }));
    } else {
      // Inner Sphere and Clan equipment can't be mixed, so switching tech base starts afresh.
      const hasWork = design.equipment.some((e) => e.equipmentId !== 'heat-sink') ||
        Object.values(design.armor).some((v) => v > 0);
      const ok = !hasWork || eraDialog === 'startup' ||
        window.confirm(`Switching to ${TECH_BASE_NAMES[techBase]} starts a new design. Save the current one first if you want to keep it. Continue?`);
      if (!ok) return;
      load(newDesign(era, techBase));
    }
    setEraDialog(null);
  };
  const era = getEra(design.era);

  // Samples for the current era / tech base first, then the rest.
  const presetGroups = useMemo(() => {
    const groups = new Map<string, typeof PRESETS>();
    const sorted = [...PRESETS].sort((a, b) =>
      Number(b.era === design.era && b.techBase === design.techBase) -
      Number(a.era === design.era && a.techBase === design.techBase));
    for (const p of sorted) {
      const label = `${p.era} ${TECH_BASE_NAMES[p.techBase]} — ${p.canon ? 'canon' : 'original samples'}`;
      groups.set(label, [...(groups.get(label) ?? []), p]);
    }
    return [...groups];
  }, [design.era, design.techBase]);

  const onImport = async (file: File) => {
    try {
      load(parseDesign(JSON.parse(await file.text())));
      setNotice(`Imported ${file.name}`);
    } catch (e) {
      setNotice(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="app">
      {eraDialog && (
        <EraDialog
          current={design.era}
          currentTechBase={design.techBase}
          onSelect={chooseEra}
          onCancel={eraDialog === 'change' ? () => setEraDialog(null) : undefined}
        />
      )}
      <header className="toolbar">
        <h1>
          MechForger{' '}
          <span className="muted small">
            {era ? `${era.name} · ${TECH_BASE_NAMES[design.techBase]} · ${era.rulesLevel} · ${era.year}` : design.era}
          </span>{' '}
          <button className="small" onClick={() => setEraDialog('change')}>Change era</button>
        </h1>
        <div className="row wrap">
          <StatusLight issues={issues} />
          <input aria-label="Chassis name" value={design.chassis} placeholder="Chassis"
            onChange={(e) => update((d) => ({ ...d, chassis: e.target.value }))} />
          <input aria-label="Model" value={design.model} placeholder="Model" style={{ width: '7rem' }}
            onChange={(e) => update((d) => ({ ...d, model: e.target.value }))} />
          <button onClick={() => load(newDesign(design.era, design.techBase))}>New</button>
          <select aria-label="Load a design" value="" onChange={(e) => {
            const [kind, key] = e.target.value.split(':', 2) as [string, string];
            if (kind === 'preset') load(PRESETS.find((p) => p.key === key)!.build());
            if (kind === 'saved' && saved[key]) load(parseDesign(saved[key]));
          }}>
            <option value="">Load…</option>
            {presetGroups.map(([label, presets]) => (
              <optgroup key={label} label={label}>
                {presets.map((p) => <option key={p.key} value={`preset:${p.key}`}>{p.key}</option>)}
              </optgroup>
            ))}
            {Object.keys(saved).length > 0 && (
              <optgroup label="Saved">
                {Object.keys(saved).sort().map((k) => <option key={k} value={`saved:${k}`}>{k}</option>)}
              </optgroup>
            )}
          </select>
          <button onClick={() => {
            saveDesign(design);
            setSaved(listSaved());
            setNotice(`Saved "${designKey(design)}" in this browser`);
          }}>Save</button>
          {saved[designKey(design)] && (
            <button onClick={() => {
              deleteSaved(designKey(design));
              setSaved(listSaved());
              setNotice(`Deleted saved "${designKey(design)}"`);
            }}>Delete saved</button>
          )}
          <button onClick={() => downloadJson(design)}>Export JSON</button>
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
          <SummaryPanel design={design} summary={summary} issues={issues} />
        </div>
        <div className="col wide">
          <CritPanel design={design} summary={summary} update={update}
            selected={selected} setSelected={setSelected} />
        </div>
      </main>
    </div>
  );
}
