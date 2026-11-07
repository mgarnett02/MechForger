import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MechDesign } from '../rules/types';
import { computeMech } from '../rules/construction';
import { validate } from '../rules/validation';
import { newDesign, parseDesign } from '../rules/edit';
import { PRESETS } from '../data/canonical';
import type { EraId } from '../rules/eras';
import { eraLabel, getEra } from '../rules/eras';
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

  const chooseEra = (era: EraId) => {
    update((d) => (d.era === era ? d : { ...d, era }));
    setEraDialog(null);
  };
  const era = getEra(design.era);

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
          onSelect={chooseEra}
          onCancel={eraDialog === 'change' ? () => setEraDialog(null) : undefined}
        />
      )}
      <header className="toolbar">
        <h1>
          MechForger{' '}
          <span className="muted small">{era ? `${era.name} · ${eraLabel(era)}` : design.era}</span>{' '}
          <button className="small" onClick={() => setEraDialog('change')}>Change era</button>
        </h1>
        <div className="row wrap">
          <StatusLight issues={issues} />
          <input aria-label="Chassis name" value={design.chassis} placeholder="Chassis"
            onChange={(e) => update((d) => ({ ...d, chassis: e.target.value }))} />
          <input aria-label="Model" value={design.model} placeholder="Model" style={{ width: '7rem' }}
            onChange={(e) => update((d) => ({ ...d, model: e.target.value }))} />
          <button onClick={() => load(newDesign(design.era))}>New</button>
          <select aria-label="Load a design" value="" onChange={(e) => {
            const [kind, key] = e.target.value.split(':', 2) as [string, string];
            if (kind === 'preset') load(PRESETS.find((p) => p.key === key)!.build());
            if (kind === 'saved' && saved[key]) load(parseDesign(saved[key]));
          }}>
            <option value="">Load…</option>
            <optgroup label="Sample designs">
              {PRESETS.map((p) => <option key={p.key} value={`preset:${p.key}`}>{p.key}</option>)}
            </optgroup>
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
