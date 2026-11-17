import type {
  CockpitType, EngineType, GyroType, HeatSinkType, JumpJetType, LamType, MechConfig, MechDesign, MyomerType, StructureType, TechBase,
} from '../rules/types';
import { EFFECTIVE_COCKPIT_NAMES, effectiveCockpit, isIndustrial, isQuadVee, isSuperheavy, isTripod } from '../rules/types';
import type { ComponentOption } from '../rules/tables';
import {
  COCKPIT_OPTIONS, COMPACT_HS_OPTION, ENGINE_OPTIONS, GYRO_OPTIONS, HEAT_SINK_OPTIONS, JUMP_JET_OPTIONS, MYOMER_OPTIONS,
  STRUCTURE_NAMES, STRUCTURE_OPTIONS, componentAvailable, structureSlots, componentEraOk, componentFirstEra,
} from '../rules/tables';
import { ARM_LOCATIONS, LAM_TYPE_NAMES, LOCATION_NAMES, TECH_BASE_NAMES, isQuad, locationName, mechLocations, techOf } from '../rules/types';
import { TechPicker } from './TechPicker';
import { ERAS, getEra, isAvailableIn } from '../rules/eras';
import type { MechSummary } from '../rules/construction';
import { SUPERHEAVY_TONNAGES, TONNAGES, engineSideTorsoSlots, freeHeatSinks, isLargeEngine, maxWalkMP } from '../rules/tables';
import {
  setActuator, setCockpitType, setConfig, setFullHeadEjection, setLam, setEngineHeatSinks, setEngineType, setGyroType, setHeatSinkTotal,
  setCompactHeatSinks, setHeatSinkType, setJumpBoosterMP, setJumpJetType, setJumpMP, setLaserHeatSinks,
  setEnvironmentalSealing, setFranken, setFrankenLocation, setMixedTech, setMyomer, setQuadVeeMotive, setStructureType, setTechBase, setTonnage, setWalkMP,
} from '../rules/edit';
import { frankenLocation } from '../rules/franken';
import { setOmni } from '../rules/omni';
import { NumberField } from './NumberField';

interface Props {
  design: MechDesign;
  summary: MechSummary;
  update: (fn: (d: MechDesign) => MechDesign) => void;
}

/** Inner Sphere / Clan options introduced in the Clan Invasion era. */
const ADVANCED_ERA = '3050';

const STRUCTURE_NOTES: Partial<Record<StructureType, string>> = {
  industrial: ' — makes an IndustrialMech',
  composite: ' — half BV, fragile', reinforced: ' — double BV, tough',
};

export function ChassisPanel({ design, summary, update }: Props) {
  const hs = summary.heatSinks;
  const era = getEra(design.era);
  const advanced = isAvailableIn(ADVANCED_ERA, design.era);
  const lockedTitle = advanced ? undefined : 'Available from the Clan Invasion era (3050)';
  const sh = isSuperheavy(design);
  const sideSlots = (type: EngineType) => engineSideTorsoSlots(type, techOf(design, 'engine'), sh);
  const xlSlots = sideSlots('xl');
  const large = isLargeEngine(summary.rating);
  const specialCockpit = EFFECTIVE_COCKPIT_NAMES[effectiveCockpit(design)];
  const jumpMax = design.jumpJetType === 'improved' || design.jumpJetType === 'prototype-improved' ? summary.runMP : design.walkMP;
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
            <optgroup label="Superheavy (Interstellar Operations)">
              {SUPERHEAVY_TONNAGES.map((t) => (
                <option key={t} value={t} disabled={design.lam ? true : isQuadVee(design)}>{t} tons</option>
              ))}
            </optgroup>
          </select>
          <span className="muted"> {summary.weightClass}</span>
        </div>

        <label>Configuration</label>
        <div>
          <select aria-label="Configuration" value={design.lam ? `lam-${design.lam}` : design.config}
            onChange={(e) => {
              const v = e.target.value;
              update((d) => (v.startsWith('lam-') ? setLam(d, v.slice(4) as LamType) : setConfig(setLam(d, null), v as MechConfig)));
            }}>
            <option value="biped">Biped (two legs, two arms)</option>
            <option value="quad">Quad (four legs)</option>
            <option value="tripod">Tripod (three legs, two arms)</option>
            <option value="quadvee" disabled={sh} title="Clan, from 3130: a quad that converts into a tracked or wheeled vehicle">QuadVee (quad / vehicle)</option>
            <option value="lam-standard" disabled={design.techBase !== 'IS' || sh}>LAM, standard (3 modes)</option>
            <option value="lam-bimodal" disabled={design.techBase !== 'IS' || sh}>LAM, bimodal (no AirMech)</option>
          </select>{' '}
          {isQuadVee(design) && (
            <select aria-label="QuadVee motive" value={design.quadVeeMotive ?? 'tracked'}
              onChange={(e) => update((d) => setQuadVeeMotive(d, e.target.value as 'tracked' | 'wheeled'))}>
              <option value="tracked">Tracked (tracks: 10% of tonnage)</option>
              <option value="wheeled">Wheeled (wheels: 15% of tonnage)</option>
            </select>
          )}
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
          <label className="check" title="Full Head Ejection System (as on the Hatchetman): no weight or slots, 1,725,000 C-bills">
            <input type="checkbox" checked={!!design.fullHeadEjection}
              onChange={(e) => update((d) => setFullHeadEjection(d, e.target.checked))} />
            Full head ejection
          </label>
          {isIndustrial(design) && (
            <label className="check" title="Environmental sealing: one slot in every location, a tenth of the tonnage">
              <input type="checkbox" checked={!!design.environmentalSealing}
                onChange={(e) => update((d) => setEnvironmentalSealing(d, e.target.checked))} />
              Environmental sealing
            </label>
          )}
        </div>

        <label>Structure</label>
        <div>
          <select aria-label="Internal structure" value={design.structureType} title={design.franken ? 'A FrankenMek sets its structure per location below' : lockedTitle}
            disabled={!!design.franken}
            onChange={(e) => update((d) => setStructureType(d, e.target.value as StructureType))}>
            {(Object.keys(STRUCTURE_OPTIONS) as StructureType[]).map((k) => {
              const n = structureSlots(k, techOf(design, 'structure'), design.tonnage > 100);
              return (
                <option key={k} value={k} disabled={k !== 'standard' && !ok(STRUCTURE_OPTIONS[k])} title={k === 'standard' ? undefined : why(STRUCTURE_OPTIONS[k])}>
                  {STRUCTURE_NAMES[k]}{n ? ` (${n} slots)` : ''}{STRUCTURE_NOTES[k] ?? ''}
                </option>
              );
            })}
          </select>{' '}
          {!design.franken && <TechPicker design={design} part="structure" update={update} />}
          <span className="muted"> {summary.weights.structure} t</span>{' '}
          <label className="check small" title="FrankenMek (Campaign Operations, Experimental): each location comes from a donor 'Mech with its own structure type and tonnage">
            <input type="checkbox" checked={!!design.franken} disabled={!advanced && !design.franken}
              onChange={(e) => update((d) => setFranken(d, e.target.checked))} />
            FrankenMek
          </label>
        </div>
        {design.franken && (
          <>
            <label>Donors</label>
            <div>
              <table className="weights franken">
                <thead><tr><th>Location</th><th>Structure</th><th>Tech</th><th>Donor tons</th><th>IS</th></tr></thead>
                <tbody>
                  {mechLocations(design).map((loc) => {
                    const f = frankenLocation(design, loc);
                    return (
                      <tr key={loc}>
                        <td>{locationName(design, loc)}</td>
                        <td>
                          <select aria-label={`${locationName(design, loc)} donor structure`} value={f.type}
                            onChange={(e) => update((d) => setFrankenLocation(d, loc, { type: e.target.value as StructureType }))}>
                            {(Object.keys(STRUCTURE_OPTIONS) as StructureType[]).map((k) => <option key={k} value={k}>{STRUCTURE_NAMES[k]}</option>)}
                          </select>
                        </td>
                        <td>
                          <select aria-label={`${locationName(design, loc)} donor tech base`} value={f.tech}
                            onChange={(e) => update((d) => setFrankenLocation(d, loc, { tech: e.target.value as TechBase }))}>
                            <option value="IS">IS</option><option value="Clan">Clan</option>
                          </select>
                        </td>
                        <td>
                          <NumberField label={`${locationName(design, loc)} donor tonnage`} value={f.tonnage} min={10} max={200} step={5} width="3.5rem"
                            onChange={(n) => update((d) => setFrankenLocation(d, loc, { tonnage: Math.max(10, Math.min(200, Math.round(n))) }))} />
                        </td>
                        <td className="num">{summary.structure?.[loc] ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="muted small">Structure weighs each donor's share (head 5%, center torso 25%, side torsos 15%, limbs 10%); legs must come from donors at least as heavy as the center torso's; jump jets weigh by their location's donor.</p>
            </div>
          </>
        )}

        <label>Walking MP</label>
        <div>
          <NumberField label="Walking MP" value={design.walkMP} min={1} max={maxWalkMP(design.tonnage)}
            onChange={(n) => update((d) => setWalkMP(d, n))} />
          <span className="muted"> Run {summary.runMP}{summary.mascRunMP ? ` (boosted ${summary.mascRunMP})` : ''}</span>
        </div>

        <label>Engine</label>
        <div>
          <select aria-label="Engine type" value={design.engineType}
            onChange={(e) => update((d) => setEngineType(d, e.target.value as EngineType))}>
            <option value="standard">{summary.rating} Fusion</option>
            <option value="xl" disabled={!ok(ENGINE_OPTIONS.xl)} title={why(ENGINE_OPTIONS.xl)}>
              {summary.rating} XL ({xlSlots} slots per side torso)
            </option>
            <option value="xxl" disabled={!ok(ENGINE_OPTIONS.xxl)} title={why(ENGINE_OPTIONS.xxl)}>
              {summary.rating} XXL ({sideSlots('xxl')} slots per side torso, runs hot)
            </option>
            <option value="light" disabled={!ok(ENGINE_OPTIONS.light)} title={why(ENGINE_OPTIONS.light)}>
              {summary.rating} Light ({sideSlots('light')} slot{sideSlots('light') > 1 ? 's' : ''} per side torso)
            </option>
            <option value="compact" disabled={!ok(ENGINE_OPTIONS.compact) || large} title={large ? 'No large compact engines' : why(ENGINE_OPTIONS.compact)}>
              {summary.rating} Compact ({sh ? 2 : 3} center-torso slots)
            </option>
            <option value="fission" disabled={!ok(ENGINE_OPTIONS.fission)} title="Fission: 1.75× fusion weight, 5 free heat sinks">
              {summary.rating} Fission
            </option>
            <option value="fuel-cell" disabled={!ok(ENGINE_OPTIONS['fuel-cell'])} title="Fuel cell: 1.2× fusion weight, 1 free heat sink">
              {summary.rating} Fuel Cell
            </option>
            <option value="ice" disabled={!ok(ENGINE_OPTIONS.ice)} title="Internal combustion: twice fusion weight, no free heat sinks">
              {summary.rating} I.C.E.
            </option>
          </select>{' '}
          <TechPicker design={design} part="engine" update={update} />
          <span className="muted"> {summary.engineWeight ?? '—'} t{large ? ' · large engine (over 400)' : ''}</span>
        </div>

        <label>Myomer</label>
        <div>
          <select aria-label="Myomer" value={design.myomer}
            title={advanced ? undefined : lockedTitle}
            onChange={(e) => update((d) => setMyomer(d, e.target.value as MyomerType))}>
            <option value="standard">Standard</option>
            <option value="tsm" disabled={!ok(MYOMER_OPTIONS.tsm) || isIndustrial(design)} title={why(MYOMER_OPTIONS.tsm)}>
              Triple-Strength (6 slots)
            </option>
            <option value="industrial-tsm" disabled={!ok(MYOMER_OPTIONS['industrial-tsm']) || !isIndustrial(design)}
              title={isIndustrial(design) ? why(MYOMER_OPTIONS['industrial-tsm']) : 'IndustrialMechs only'}>
              Industrial TSM (12 slots)
            </option>
            <option value="super-cooled" disabled={!ok(MYOMER_OPTIONS['super-cooled']) || isIndustrial(design)} title="RISC super-cooled myomer: no heat from walking or running">
              Super-Cooled (6 slots)
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
            <option value="standard" disabled={sh}>Standard (4 slots)</option>
            <option value="xl" disabled={sh || !ok(GYRO_OPTIONS.xl)} title={why(GYRO_OPTIONS.xl)}>XL (6 slots)</option>
            <option value="heavy-duty" disabled={sh || !ok(GYRO_OPTIONS['heavy-duty'])} title={why(GYRO_OPTIONS['heavy-duty'])}>
              Heavy-duty (4 slots)
            </option>
            <option value="compact" disabled={sh || !ok(GYRO_OPTIONS.compact)} title={why(GYRO_OPTIONS.compact)}>
              Compact (2 slots)
            </option>
            <option value="none" disabled={sh || design.cockpitType !== 'interface'} title="Only with an interface cockpit">None (interface cockpit)</option>
            <option value="superheavy" disabled={!sh} title="Superheavy 'Mechs only: double weight, 2 slots">Superheavy (2 slots)</option>
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
            <option value="torso-mounted" disabled={!ok(COCKPIT_OPTIONS['torso-mounted'])} title={why(COCKPIT_OPTIONS['torso-mounted'])}>
              Torso-mounted (cockpit in center torso)
            </option>
            <option value="vrrp" disabled={!ok(COCKPIT_OPTIONS.vrrp)} title="Virtual-reality piloting pod: built like a torso-mounted cockpit (3 t); BV × 1.4">
              Virtual-reality piloting pod
            </option>
            <option value="command-console" disabled={!ok(COCKPIT_OPTIONS['command-console'])} title={why(COCKPIT_OPTIONS['command-console'])}>
              Command console (+2 initiative, heavy/assault)
            </option>
            <option value="industrial" disabled={!isIndustrial(design)} title={isIndustrial(design) ? 'Cheaper; no advanced fire control (+1 to hit, BV ×0.9)' : 'IndustrialMechs only'}>
              Industrial (no adv. fire control)
            </option>
            <option value="interface" disabled={!ok(COCKPIT_OPTIONS.interface)} title={why(COCKPIT_OPTIONS.interface)}>
              Interface (4 t; no gyro needed)
            </option>
            <option value="primitive" title="Primitive 'Mech: 5 t; engine rated 1.2 × tonnage × walking MP; primitive armor">
              Primitive (engine ×1.2)
            </option>
            <option value="primitive-industrial" disabled={!isIndustrial(design)} title="Primitive IndustrialMech without advanced fire control">
              Primitive industrial
            </option>
          </select>
          <span className="muted"> {specialCockpit ? `${specialCockpit} cockpit · ` : ''}{summary.weights.cockpit} t</span>
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
            <option value="prototype" disabled={!ok(JUMP_JET_OPTIONS.prototype)} title="Built as standard jump jets; +3 to the landing piloting roll">Prototype</option>
            <option value="prototype-improved" disabled={!ok(JUMP_JET_OPTIONS['prototype-improved'])} title="Standard weight and slots; jump up to running MP for 2 heat per MP (at least 6)">Prototype improved</option>
          </select>
          <span className="muted"> {summary.weights.jumpJets} t{summary.partialWing?.jumpBonus ? ` · +${summary.partialWing.jumpBonus} partial wing = ${summary.totalJumpMP}` : ''}</span>
        </div>

        <label title="Mechanical jump boosters (Tactical Operations, Inner Sphere 3060): jump without heat; 2 slots in each leg, 5% of tonnage per MP">Jump boosters</label>
        <div>
          <NumberField label="Mechanical jump booster MP" value={design.jumpBoosterMP ?? 0} min={0} max={design.walkMP}
            onChange={(n) => update((d) => setJumpBoosterMP(d, n))} />
          <span className="muted"> MP (no heat)</span>
        </div>

        <label>Heat sinks</label>
        <div>
          <NumberField label="Total heat sinks" value={hs.total} min={freeHeatSinks(design.engineType)}
            invalid={hs.total < freeHeatSinks(design.engineType)}
            onChange={(n) => update((d) => setHeatSinkTotal(d, n))} />
          <select aria-label="Heat sink type" value={design.laserHeatSinks ? 'laser' : design.compactHeatSinks ? 'compact' : design.heatSinkType}
            onChange={(e) => update((d) => e.target.value === 'laser'
              ? setLaserHeatSinks(setHeatSinkType(d, 'double'), true)
              : e.target.value === 'compact' ? setCompactHeatSinks(d, true)
              : setLaserHeatSinks(setHeatSinkType(d, e.target.value as HeatSinkType), false))}>
            <option value="single">Single</option>
            <option value="double" disabled={!ok(HEAT_SINK_OPTIONS.double)} title={why(HEAT_SINK_OPTIONS.double)}>Double</option>
            <option value="laser" disabled={!ok(HEAT_SINK_OPTIONS.double) || techOf(design, 'heatSinks') !== 'Clan'} title="Clan laser heat sinks: same weight, slots and dissipation as Clan double heat sinks">Laser (Clan)</option>
            <option value="compact" disabled={!ok(COMPACT_HS_OPTION) || techOf(design, 'heatSinks') === 'Clan'} title="Compact heat sinks: 1.5 t, two per slot, twice as many in the engine (Inner Sphere, 3058)">Compact (IS)</option>
          </select>{' '}
          {design.heatSinkType === 'double' && <TechPicker design={design} part="heatSinks" update={update} />}
          <span className="muted"> {summary.weights.heatSinks} t · dissipates {hs.dissipation}</span>
          <label className="check small" title="RISC heat sink override kit (Dark Age, Experimental): BV × 1.01">
            <input type="checkbox" checked={!!design.heatSinkOverrideKit} disabled={!isAvailableIn('3131', design.era) && !design.heatSinkOverrideKit}
              onChange={(e) => update((d) => ({ ...d, heatSinkOverrideKit: e.target.checked || undefined }))} />
            Override kit
          </label>
        </div>

        <label>In engine</label>
        <div>
          <NumberField label="Heat sinks in engine" value={hs.inEngine} min={0} max={Math.min(hs.engineCapacity, hs.total)}
            onChange={(n) => update((d) => setEngineHeatSinks(d, n))} />
          <span className="muted"> of {hs.engineCapacity} max · {hs.external} need slots</span>
        </div>
      </div>

      {design.lam && <LamInfo design={design} summary={summary} />}
      {sh && (
        <p className="small muted">
          Superheavy 'Mech: each critical slot holds twice as much (equipment takes half its usual slots, rounded up,
          and two tons of the same ammunition share a slot). Superheavy gyro and cockpit; no jump jets, MASC, TSM or
          armored components; head armor up to 12.
        </p>
      )}
      {isQuadVee(design) && (
        <p className="small muted">
          QuadVee: conversion equipment {summary.weights.conversion} t (10% of tonnage), conversion gear in every leg,
          QuadVee cockpit (4 t) and {design.quadVeeMotive === 'wheeled' ? 'wheels' : 'tracks'} for vehicle mode.
        </p>
      )}
      {isTripod(design) && (
        <p className="small muted">
          Tripod: a third (center) leg with its own armor and critical slots, 10% heavier structure and a tripod cockpit.
        </p>
      )}
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

/** Land-Air 'Mech summary: conversion equipment and movement in each mode. */
function LamInfo({ design, summary }: { design: MechDesign; summary: MechSummary }) {
  const lam = summary.lam;
  if (!design.lam || !lam) return null;
  return (
    <div className="lam-info">
      <h3>Land-Air 'Mech <span className="muted small">({LAM_TYPE_NAMES[design.lam]})</span></h3>
      <p className="small muted">
        Conversion equipment {summary.weights.conversion} t ({design.lam === 'bimodal' ? '15' : '10'}% of tonnage) ·
        Avionics in the head and side torsos, Landing Gear in the center and side torsos.
        Standard or compact fusion engine, no Endo Steel or ferro-fibrous, up to 55 tons, at least 3 jump MP.
      </p>
      <table className="lam-modes">
        <tbody>
          <tr><th>'Mech</th><td>Walk {design.walkMP} · Run {summary.runMP} · Jump {summary.totalJumpMP}</td></tr>
          {lam.airMech && (
            <tr><th>AirMech</th><td>Walk {lam.airMech.walk} · Run {lam.airMech.run} · Flight {lam.airMech.cruise} / {lam.airMech.flank}</td></tr>
          )}
          <tr><th>Fighter</th><td>Safe thrust {lam.fighter.safe} · Max thrust {lam.fighter.max}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
