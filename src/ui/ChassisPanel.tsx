import type { MechDesign } from '../rules/types';
import { ARM_LOCATIONS, LOCATION_NAMES } from '../rules/types';
import type { MechSummary } from '../rules/construction';
import { TONNAGES, maxWalkMP } from '../rules/tables';
import {
  setActuator, setEngineHeatSinks, setHeatSinkTotal, setJumpMP, setTonnage, setWalkMP,
} from '../rules/edit';
import { NumberField } from './NumberField';

interface Props {
  design: MechDesign;
  summary: MechSummary;
  update: (fn: (d: MechDesign) => MechDesign) => void;
}

export function ChassisPanel({ design, summary, update }: Props) {
  const hs = summary.heatSinks;
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

        <label>Structure</label>
        <div>Standard <span className="muted">({summary.weights.structure} t)</span></div>

        <label>Walking MP</label>
        <div>
          <NumberField label="Walking MP" value={design.walkMP} min={1} max={maxWalkMP(design.tonnage)}
            onChange={(n) => update((d) => setWalkMP(d, n))} />
          <span className="muted"> Run {summary.runMP}</span>
        </div>

        <label>Engine</label>
        <div>
          {summary.rating} Fusion{' '}
          <span className="muted">({summary.engineWeight ?? '—'} t)</span>
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
          <span className="muted"> single, {summary.weights.heatSinks} t</span>
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
