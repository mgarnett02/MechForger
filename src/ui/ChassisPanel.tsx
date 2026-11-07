import type { EngineType, HeatSinkType, MechDesign, StructureType, TechBase } from '../rules/types';
import { ARM_LOCATIONS, LOCATION_NAMES, TECH_BASE_NAMES } from '../rules/types';
import { getEra, isAvailableIn } from '../rules/eras';
import type { MechSummary } from '../rules/construction';
import { TONNAGES, maxWalkMP } from '../rules/tables';
import {
  setActuator, setEngineHeatSinks, setEngineType, setHeatSinkTotal, setHeatSinkType, setJumpMP,
  setStructureType, setTechBase, setTonnage, setWalkMP,
} from '../rules/edit';
import { NumberField } from './NumberField';

interface Props {
  design: MechDesign;
  summary: MechSummary;
  update: (fn: (d: MechDesign) => MechDesign) => void;
}

/** Inner Sphere / Clan options introduced in the Clan Invasion era. */
const ADVANCED_ERA = '3050';

export function ChassisPanel({ design, summary, update }: Props) {
  const hs = summary.heatSinks;
  const era = getEra(design.era);
  const advanced = isAvailableIn(ADVANCED_ERA, design.era);
  const lockedTitle = advanced ? undefined : 'Available from the Clan Invasion era (3050)';
  const xlSlots = design.techBase === 'Clan' ? 2 : 3;
  const fillerSlots = design.techBase === 'Clan' ? 7 : 14;
  return (
    <section className="panel">
      <h2>Chassis</h2>
      <div className="form-grid">
        <label>Tonnage</label>
        <div>
          <select value={design.tonnage} onChange={(e) => update((d) => setTonnage(d, Number(e.target.value)))}>
            {TONNAGES.map((t) => (
              <option key={t} value={t}>{t} tons</option>
            ))}
          </select>
          <span className="muted"> {summary.weightClass}</span>
        </div>

        <label>Tech base</label>
        <div>
          <select aria-label="Tech base" value={design.techBase} disabled={(era?.techBases.length ?? 1) < 2}
            onChange={(e) => update((d) => setTechBase(d, e.target.value as TechBase))}>
            {(era?.techBases ?? ['IS']).map((t) => <option key={t} value={t}>{TECH_BASE_NAMES[t]}</option>)}
          </select>
        </div>

        <label>Structure</label>
        <div>
          <select aria-label="Internal structure" value={design.structureType} title={lockedTitle}
            onChange={(e) => update((d) => setStructureType(d, e.target.value as StructureType))}>
            <option value="standard">Standard</option>
            <option value="endo-steel" disabled={!advanced}>Endo Steel ({fillerSlots} slots)</option>
          </select>
          <span className="muted"> {summary.weights.structure} t</span>
        </div>

        <label>Walking MP</label>
        <div>
          <NumberField label="Walking MP" value={design.walkMP} min={1} max={maxWalkMP(design.tonnage)}
            onChange={(n) => update((d) => setWalkMP(d, n))} />
          <span className="muted"> Run {summary.runMP}{summary.mascRunMP ? ` (MASC ${summary.mascRunMP})` : ''}</span>
        </div>

        <label>Engine</label>
        <div>
          <select aria-label="Engine type" value={design.engineType} title={lockedTitle}
            onChange={(e) => update((d) => setEngineType(d, e.target.value as EngineType))}>
            <option value="standard">{summary.rating} Fusion</option>
            <option value="xl" disabled={!advanced}>{summary.rating} XL ({xlSlots} slots per side torso)</option>
          </select>
          <span className="muted"> {summary.engineWeight ?? '—'} t</span>
        </div>

        <label>Gyro / Cockpit</label>
        <div>Standard <span className="muted">({summary.weights.gyro} t / {summary.weights.cockpit} t)</span></div>

        <label>Jumping MP</label>
        <div>
          <NumberField label="Jumping MP" value={summary.jumpMP} min={0} max={design.walkMP}
            invalid={summary.jumpMP > design.walkMP}
            onChange={(n) => update((d) => setJumpMP(d, n))} />
          <span className="muted"> {summary.weights.jumpJets} t</span>
        </div>

        <label>Heat sinks</label>
        <div>
          <NumberField label="Total heat sinks" value={hs.total} min={10}
            invalid={hs.total < 10}
            onChange={(n) => update((d) => setHeatSinkTotal(d, n))} />
          <select aria-label="Heat sink type" value={design.heatSinkType} title={lockedTitle}
            onChange={(e) => update((d) => setHeatSinkType(d, e.target.value as HeatSinkType))}>
            <option value="single">Single</option>
            <option value="double" disabled={!advanced}>Double</option>
          </select>
          <span className="muted"> {summary.weights.heatSinks} t · dissipates {hs.dissipation}</span>
        </div>

        <label>In engine</label>
        <div>
          <NumberField label="Heat sinks in engine" value={hs.inEngine} min={0} max={Math.min(hs.engineCapacity, hs.total)}
            onChange={(n) => update((d) => setEngineHeatSinks(d, n))} />
          <span className="muted"> of {hs.engineCapacity} max · {hs.external} need slots</span>
        </div>
      </div>

      <h3>Arm actuators</h3>
      <div className="actuators">
        {ARM_LOCATIONS.map((arm) => (
          <div key={arm}>
            <strong>{LOCATION_NAMES[arm]}</strong>
            <label className="check">
              <input type="checkbox" checked={design.actuators[arm].lowerArm}
                onChange={(e) => update((d) => setActuator(d, arm, 'lowerArm', e.target.checked))} />
              Lower arm
            </label>
            <label className="check">
              <input type="checkbox" checked={design.actuators[arm].hand}
                onChange={(e) => update((d) => setActuator(d, arm, 'hand', e.target.checked))} />
              Hand
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}
