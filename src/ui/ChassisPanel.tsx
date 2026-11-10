import type {
  CockpitType, EngineType, GyroType, HeatSinkType, JumpJetType, MechConfig, MechDesign, MyomerType, StructureType, TechBase,
} from '../rules/types';
import type { ComponentOption } from '../rules/tables';
import {
  COCKPIT_OPTIONS, ENGINE_OPTIONS, GYRO_OPTIONS, HEAT_SINK_OPTIONS, JUMP_JET_OPTIONS, MYOMER_OPTIONS,
  STRUCTURE_OPTIONS, componentAvailable, componentEraOk, componentFirstEra,
} from '../rules/tables';
import { ARM_LOCATIONS, LOCATION_NAMES, TECH_BASE_NAMES, isQuad } from '../rules/types';
import { ERAS, getEra, isAvailableIn } from '../rules/eras';
import type { MechSummary } from '../rules/construction';
import { TONNAGES, maxWalkMP } from '../rules/tables';
import {
  setActuator, setCockpitType, setConfig, setEngineHeatSinks, setEngineType, setGyroType, setHeatSinkTotal,
  setHeatSinkType, setJumpJetType, setJumpMP,
  setMixedTech, setMyomer, setStructureType, setTechBase, setTonnage, setWalkMP,
} from '../rules/edit';
import { setOmni } from '../rules/omni';
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
  const jumpMax = design.jumpJetType === 'improved' ? summary.runMP : design.walkMP;
  /** Whether a construction option can be chosen, and why not when it can't. */
  const ok = (o: ComponentOption) => componentAvailable(o, design.era, design.techBase, design.mixedTech);
  const why = (o: ComponentOption) => {
    if (!componentEraOk(o, design.era, design.techBase)) {
      const first = ERAS.find((e) => e.id === componentFirstEra(o, design.techBase));
      return `Available from the ${first?.name} era (${first?.year})`;
    }
    if (!ok(o)) return 'Inner Sphere technology: needs mixed tech on a Clan design';
    return undefined;
  };
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

        <label>Configuration</label>
        <div>
          <select aria-label="Configuration" value={design.config}
            onChange={(e) => update((d) => setConfig(d, e.target.value as MechConfig))}>
            <option value="biped">Biped (two legs, two arms)</option>
            <option value="quad">Quad (four legs)</option>
          </select>
        </div>

        <label>Tech base</label>
        <div>
          <select aria-label="Tech base" value={design.techBase} disabled={(era?.techBases.length ?? 1) < 2}
            onChange={(e) => update((d) => setTechBase(d, e.target.value as TechBase))}>
            {(era?.techBases ?? ['IS']).map((t) => <option key={t} value={t}>{TECH_BASE_NAMES[t]}</option>)}
          </select>
        </div>

        <label>Options</label>
        <div className="row wrap">
          <label className="check" title={advanced ? 'Mixed tech uses Advanced rules' : lockedTitle}>
            <input type="checkbox" checked={design.mixedTech} disabled={!advanced && !design.mixedTech}
              onChange={(e) => update((d) => setMixedTech(d, e.target.checked))} />
            Mixed tech
          </label>
          <label className="check" title={advanced ? 'Fixed base chassis with swappable pod configurations' : lockedTitle}>
            <input type="checkbox" checked={!!design.omni} disabled={!advanced && !design.omni}
              onChange={(e) => {
                const on = e.target.checked;
                const many = (design.omni?.configurations.length ?? 0) > 1;
                if (!on && many && !window.confirm('Turn off OmniMech? Only the current configuration will be kept.')) return;
                update((d) => setOmni(d, on));
              }} />
            OmniMech
          </label>
        </div>

        <label>Structure</label>
        <div>
          <select aria-label="Internal structure" value={design.structureType} title={lockedTitle}
            onChange={(e) => update((d) => setStructureType(d, e.target.value as StructureType))}>
            <option value="standard">Standard</option>
            <option value="endo-steel" disabled={!ok(STRUCTURE_OPTIONS['endo-steel'])}
              title={why(STRUCTURE_OPTIONS['endo-steel'])}>Endo Steel ({fillerSlots} slots)</option>
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
          <select aria-label="Engine type" value={design.engineType}
            onChange={(e) => update((d) => setEngineType(d, e.target.value as EngineType))}>
            <option value="standard">{summary.rating} Fusion</option>
            <option value="xl" disabled={!ok(ENGINE_OPTIONS.xl)} title={why(ENGINE_OPTIONS.xl)}>
              {summary.rating} XL ({xlSlots} slots per side torso)
            </option>
            <option value="light" disabled={!ok(ENGINE_OPTIONS.light)} title={why(ENGINE_OPTIONS.light)}>
              {summary.rating} Light (2 slots per side torso)
            </option>
            <option value="compact" disabled={!ok(ENGINE_OPTIONS.compact)} title={why(ENGINE_OPTIONS.compact)}>
              {summary.rating} Compact (3 center-torso slots)
            </option>
          </select>
          <span className="muted"> {summary.engineWeight ?? '—'} t</span>
        </div>

        <label>Myomer</label>
        <div>
          <select aria-label="Myomer" value={design.myomer}
            title={advanced ? undefined : lockedTitle}
            onChange={(e) => update((d) => setMyomer(d, e.target.value as MyomerType))}>
            <option value="standard">Standard</option>
            <option value="tsm" disabled={!ok(MYOMER_OPTIONS.tsm)} title={why(MYOMER_OPTIONS.tsm)}>
              Triple-Strength (6 slots)
            </option>
          </select>
          {summary.tsmMP && (
            <span className="muted"> {summary.tsmMP.walk}/{summary.tsmMP.run} at 9+ heat</span>
          )}
        </div>

        <label>Gyro</label>
        <div>
          <select aria-label="Gyro type" value={design.gyroType}
            onChange={(e) => update((d) => setGyroType(d, e.target.value as GyroType))}>
            <option value="standard">Standard (4 slots)</option>
            <option value="xl" disabled={!ok(GYRO_OPTIONS.xl)} title={why(GYRO_OPTIONS.xl)}>XL (6 slots)</option>
            <option value="heavy-duty" disabled={!ok(GYRO_OPTIONS['heavy-duty'])} title={why(GYRO_OPTIONS['heavy-duty'])}>
              Heavy-duty (4 slots)
            </option>
            <option value="compact" disabled={!ok(GYRO_OPTIONS.compact)} title={why(GYRO_OPTIONS.compact)}>
              Compact (2 slots)
            </option>
          </select>
          <span className="muted"> {summary.weights.gyro} t</span>
        </div>

        <label>Cockpit</label>
        <div>
          <select aria-label="Cockpit type" value={design.cockpitType}
            onChange={(e) => update((d) => setCockpitType(d, e.target.value as CockpitType))}>
            <option value="standard">Standard</option>
            <option value="small" disabled={!ok(COCKPIT_OPTIONS.small)} title={why(COCKPIT_OPTIONS.small)}>
              Small (+1 piloting)
            </option>
          </select>
          <span className="muted"> {summary.weights.cockpit} t</span>
        </div>

        <label>Jumping MP</label>
        <div>
          <NumberField label="Jumping MP" value={summary.jumpMP} min={0} max={jumpMax}
            invalid={summary.jumpMP > jumpMax}
            onChange={(n) => update((d) => setJumpMP(d, n))} />{' '}
          <select aria-label="Jump jet type" value={design.jumpJetType}
            onChange={(e) => update((d) => setJumpJetType(d, e.target.value as JumpJetType))}>
            <option value="standard">Standard</option>
            <option value="improved" disabled={!ok(JUMP_JET_OPTIONS.improved)} title={why(JUMP_JET_OPTIONS.improved)}>
              Improved (up to run MP)
            </option>
          </select>
          <span className="muted"> {summary.weights.jumpJets} t</span>
        </div>

        <label>Heat sinks</label>
        <div>
          <NumberField label="Total heat sinks" value={hs.total} min={10}
            invalid={hs.total < 10}
            onChange={(n) => update((d) => setHeatSinkTotal(d, n))} />
          <select aria-label="Heat sink type" value={design.heatSinkType}
            onChange={(e) => update((d) => setHeatSinkType(d, e.target.value as HeatSinkType))}>
            <option value="single">Single</option>
            <option value="double" disabled={!ok(HEAT_SINK_OPTIONS.double)} title={why(HEAT_SINK_OPTIONS.double)}>Double</option>
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

      {isQuad(design) ? (
        <p className="small muted">
          A quad has four legs, each with a hip, upper and lower leg, and foot actuator, and no arms.
          Its legs can carry weapons, which may face forward or to the rear.
        </p>
      ) : (<>
      <h3>Arm actuators{design.omni && <span className="muted small"> (this configuration)</span>}</h3>
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
      </>)}
    </section>
  );
}
