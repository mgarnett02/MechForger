import type { ReactNode } from 'react';
import type { ArmorFacing, Location, MechDesign } from '../../rules/types';
import { LAM_TYPE_NAMES, TECH_BASE_NAMES, isQuad, locationName } from '../../rules/types';
import { computeMech } from '../../rules/construction';
import { getEra } from '../../rules/eras';
import { activeConfigName } from '../../rules/omni';
import { mechBV, mechCost, vehicleBV, vehicleCost } from '../../rules/battleValue';
import type { SupportVehicleDesign } from '../../rules/support';
import {
  CHASSIS_MODS, SV_ENGINE_NAMES, SV_LOCATION_NAMES, SV_TYPES, computeSupport, svItemWeight,
} from '../../rules/support';
import { COMPACT_LENGTH, getEquipment, shortEquipmentName } from '../../rules/equipment';
import type { FighterArc, FighterDesign } from '../../rules/fighter';
import { FIGHTER_ARMOR_NAMES, FIGHTER_ENGINE_LABELS, FIGHTER_LOCATION_NAMES, armorThreshold, computeFighter } from '../../rules/fighter';
import type { FighterWeaponRow } from '../../rules/recordSheet';
import { fighterSheetData } from '../../rules/recordSheet';
import { fighterBV, fighterCost } from '../../rules/battleValue';
import type { AmmoRow, EquipmentRow, WeaponRow } from '../../rules/recordSheet';
import { CONSCIOUSNESS, HEAT_SCALE, mechSheetData, vehicleSheetData } from '../../rules/recordSheet';
import type { VehicleArmorLocation, VehicleDesign } from '../../rules/vehicle';
import {
  MOTIVE_TYPES, VEHICLE_ENGINE_LABELS, VEHICLE_LOCATION_NAMES, computeVehicle, turretName,
} from '../../rules/vehicle';

/*
 * Record sheets follow the familiar tabletop layout (data and weapons top left,
 * armor diagram top right, warrior data, critical hit table, heat data and heat
 * scale), drawn in MechForger's own style: no publisher artwork or logos.
 */

/** Tick boxes: circles for armor, squares for internal structure. */
function Pips({ count, kind }: { count: number; kind: 'armor' | 'structure' }) {
  return (
    <span className={`pips ${kind}`} aria-label={`${count} ${kind} points`}>
      {Array.from({ length: count }, (_, i) => <span key={i} />)}
    </span>
  );
}

function Circles({ n }: { n: number }) {
  return <span className="rs-circles">{Array.from({ length: n }, (_, i) => <span key={i} />)}</span>;
}

/** A rounded, black-ruled panel with its title set into the top border. */
function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rs-panel ${className}`}>
      <h3 className="rs-panel-title">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value, wide }: { label: string; value?: ReactNode; wide?: boolean }) {
  return (
    <div className={`rs-field ${wide ? 'wide' : ''}`}>
      <span className="rs-label">{label}:</span>
      <span className="rs-value">{value ?? ''}</span>
    </div>
  );
}

function rulesLevel(d: { era: MechDesign['era']; mixedTech: boolean; lam?: MechDesign['lam'] }): string {
  // Mixed tech and Land-Air 'Mechs are Advanced rules.
  return d.mixedTech || d.lam ? 'Advanced' : getEra(d.era)?.rulesLevel ?? '';
}

function techBase(d: { techBase: MechDesign['techBase']; mixedTech: boolean }): string {
  return d.mixedTech ? `Mixed (${TECH_BASE_NAMES[d.techBase]})` : TECH_BASE_NAMES[d.techBase];
}

function eraName(d: { era: MechDesign['era'] }): string {
  const e = getEra(d.era);
  return e ? `${e.name} (${e.year})` : d.era;
}

function Inventory({ rows, equipment, showHeat }: { rows: WeaponRow[]; equipment: EquipmentRow[]; showHeat: boolean }) {
  return (
    <div className="rs-inventory">
      <div className="rs-subtitle">Weapons &amp; Equipment Inventory <span>(hexes)</span></div>
      <table className="rs-table">
        <thead>
          <tr>
            <th>Qty</th><th className="left">Type</th><th>Loc</th>{showHeat && <th>Ht</th>}
            <th>Dmg</th><th>Min</th><th>Sht</th><th>Med</th><th>Lng</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.qty}</td><td className="left">{r.name}</td><td>{r.location}</td>{showHeat && <td>{r.heat}</td>}
              <td>{r.damage}</td><td>{r.min}</td><td>{r.short}</td><td>{r.medium}</td><td>{r.long}</td>
            </tr>
          ))}
          {equipment.map((r, i) => (
            <tr key={`e${i}`}>
              <td>{r.qty}</td><td className="left">{r.name}</td><td>{r.location}</td>{showHeat && <td>—</td>}
              <td>[E]</td><td>—</td><td>—</td><td>—</td><td>—</td>
            </tr>
          ))}
          {rows.length + equipment.length === 0 && (
            <tr><td colSpan={showHeat ? 9 : 8} className="rs-empty">No weapons or equipment</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Ammo bins: tick boxes for small bins, a write-in counter for large ones. */
function AmmoTrack({ rows }: { rows: AmmoRow[] }) {
  if (!rows.length) return <p className="rs-empty">No ammunition carried.</p>;
  return (
    <ul className="rs-ammo">
      {rows.map((r, i) => (
        <li key={i}>
          <span className="rs-ammo-name">{r.name} <span className="rs-muted">[{r.location}]</span></span>
          {r.shots <= 40
            ? <span className="pips structure">{Array.from({ length: r.shots }, (_, j) => <span key={j} />)}</span>
            : <span className="rs-write-in">Shots: ______ / {r.shots}</span>}
        </li>
      ))}
    </ul>
  );
}

function SheetHeader({ kind, name }: { kind: string; name: string }) {
  return (
    <header className="rs-header">
      <div className="rs-title">{kind}</div>
      <div className="rs-name">{name}</div>
    </header>
  );
}

function Footer() {
  return <footer className="rs-footer">Record sheet generated by MechForger · {new Date().toLocaleDateString()}</footer>;
}

// ---------------------------------------------------------------------------
// BattleMech
// ---------------------------------------------------------------------------

const BODY: { loc: Location; area: string }[] = [
  { loc: 'HD', area: 'hd' }, { loc: 'LA', area: 'la' }, { loc: 'LT', area: 'lt' }, { loc: 'CT', area: 'ct' },
  { loc: 'RT', area: 'rt' }, { loc: 'RA', area: 'ra' }, { loc: 'LL', area: 'll' }, { loc: 'RL', area: 'rl' },
];

/** A humanoid (or four-legged) figure of pip clusters, one plate per location. */
function MechFigure({ design, values, kind }: {
  design: MechDesign; values: Record<Location, number>; kind: 'armor' | 'structure';
}) {
  return (
    <div className={`rs-mech-figure ${kind} ${isQuad(design) ? 'quad' : ''}`}>
      {BODY.map(({ loc, area }) => (
        <div key={loc} className={`rs-plate plate-${area}`} style={{ gridArea: area }}>
          <div className="rs-plate-label">{locationName(design, loc)} <b>({values[loc]})</b></div>
          <Pips count={values[loc]} kind={kind} />
        </div>
      ))}
    </div>
  );
}

function RearFigure({ armor }: { armor: Record<ArmorFacing, number> }) {
  // Columns 2–4 of the figure grid: under the left torso / left leg, center torso, right torso / right leg.
  const rear: [string, ArmorFacing, number][] = [
    ['Left Torso Rear', 'LTR', 2], ['Center Torso Rear', 'CTR', 3], ['Right Torso Rear', 'RTR', 4],
  ];
  return (
    <div className="rs-rear-figure">
      {rear.map(([label, f, column]) => (
        <div key={f} className={`rs-plate plate-${f.toLowerCase()}`} style={{ gridColumn: column }}>
          <div className="rs-plate-label">{label} <b>({armor[f]})</b></div>
          <Pips count={armor[f]} kind="armor" />
        </div>
      ))}
    </div>
  );
}

const CRIT_ORDER: Location[][] = [['LA', 'HD', 'RA'], ['LT', 'CT', 'RT'], ['LL', '' as Location, 'RL']];

export function MechRecordSheet({ design }: { design: MechDesign }) {
  const s = computeMech(design);
  const data = mechSheetData(design);
  const config = activeConfigName(design);
  const hsType = design.heatSinkType === 'double' ? 'Double' : 'Single';
  const engine = { standard: 'Fusion', xl: 'XL Fusion', light: 'Light Fusion', compact: 'Compact Fusion' }[design.engineType];
  const name = `${design.chassis} ${design.model}`.trim() || 'Unnamed';
  const structure = s.structure ?? { HD: 0, CT: 0, LT: 0, RT: 0, LA: 0, RA: 0, LL: 0, RL: 0 };

  const crit = (loc: Location) => {
    const slots = s.slots[loc].slots;
    const groups = slots.length > 6 ? [slots.slice(0, 6), slots.slice(6)] : [slots];
    return (
      <div className="rs-crit-loc">
        <h4>{locationName(design, loc)}</h4>
        {groups.map((g, gi) => (
          <div key={gi} className="rs-crit-group">
            {/* Every location gets the margin line; only 12-slot locations need the 1-3 / 4-6 labels. */}
            <span className="rs-crit-roll" aria-hidden={groups.length === 1}>
              {groups.length > 1 ? (gi === 0 ? '1-3' : '4-6') : ''}
            </span>
            <ol>
              {g.map((slot, i) => (
                <li key={i} className={`${slot.kind} ${slot.label.length > COMPACT_LENGTH ? 'long' : ''}`}>
                  <span className="rs-slot-no">{i + 1}.</span>
                  {slot.kind === 'empty' ? 'Roll Again' : slot.label}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    );
  };

  return (
    <article className="record-sheet mech">
      <SheetHeader kind={design.lam ? "Land-Air 'Mech Record Sheet" : 'BattleMech Record Sheet'} name={config ? `${name} (${config})` : name} />
      <div className="rs-grid-mech">
        <Panel title="'Mech Data" className="area-data">
          <div className="rs-fields">
            <Field label="Type" value={config ? `${name} ${config}` : name} wide />
            <div className="rs-move">
              <span className="rs-label">Movement Points:</span>
              <Field label="Walking" value={design.walkMP} />
              <Field label="Running" value={s.mascRunMP ? `${s.runMP} [${s.mascRunMP}]` : s.runMP} />
              <Field label="Jumping" value={s.jumpMP} />
            </div>
            <Field label="Tonnage" value={design.tonnage} />
            <Field label="Tech Base" value={techBase(design)} />
            <Field label="Rules Level" value={rulesLevel(design)} />
            <Field label="Era" value={eraName(design)} />
            <Field label="Battle Value" value={mechBV(design).total.toLocaleString('en-US')} />
            <Field label="Cost" value={`${mechCost(design).total.toLocaleString('en-US')} C-bills`} />
            <Field label="Engine" value={`${s.rating} ${engine}`} />
            {isQuad(design) && <Field label="Configuration" value="Quad" />}
            {design.lam && <Field label="Configuration" value={`LAM (${LAM_TYPE_NAMES[design.lam]})`} />}
            {s.lam?.airMech && (
              <Field label="AirMech MP" wide
                value={`Walk ${s.lam.airMech.walk} · Run ${s.lam.airMech.run} · Flight ${s.lam.airMech.cruise}/${s.lam.airMech.flank}`} />
            )}
            {s.lam && <Field label="Fighter Thrust" value={`${s.lam.fighter.safe} safe / ${s.lam.fighter.max} max`} />}
            {design.omni && <Field label="Config" value={`OmniMech — ${config}`} />}
          </div>
          {s.tsmMP && <p className="rs-note">Triple-Strength Myomer: {s.tsmMP.walk}/{s.tsmMP.run} at 9+ heat</p>}
          <Inventory rows={data.weapons} equipment={data.equipment} showHeat />
        </Panel>

        <Panel title="Armor Diagram" className="area-armor">
          <MechFigure design={design} values={design.armor as unknown as Record<Location, number>} kind="armor" />
          <RearFigure armor={design.armor} />
          <div className="rs-armor-total">
            Armor: <b>{s.armorTotal}</b>
            {design.armorType !== 'standard' && ` (${{ 'ferro-fibrous': 'Ferro-Fibrous', 'light-ferro': 'Light Ferro-Fibrous', 'heavy-ferro': 'Heavy Ferro-Fibrous' }[design.armorType]})`}
          </div>
        </Panel>

        <Panel title="Warrior Data" className="area-warrior">
          <div className="rs-fields">
            <Field label="Name" wide />
            <Field label="Gunnery Skill" />
            <Field label="Piloting Skill" />
          </div>
          <table className="rs-hits">
            <tbody>
              <tr><th>Hits Taken</th>{CONSCIOUSNESS.map((_, i) => <td key={i}>{i + 1}</td>)}</tr>
              <tr><th>Consciousness #</th>{CONSCIOUSNESS.map((c) => <td key={c}>{c}</td>)}</tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="Internal Structure Diagram" className="area-structure">
          <MechFigure design={design} values={structure} kind="structure" />
        </Panel>

        <Panel title="Critical Hit Table" className="area-crits">
          <div className="rs-crit-grid">
            {CRIT_ORDER.flat().map((loc, i) =>
              loc ? <div key={loc}>{crit(loc)}</div> : (
                <div key={`dmg${i}`} className="rs-crit-damage">
                  <div><span>Engine Hits</span><Circles n={3} /></div>
                  <div><span>Gyro Hits</span><Circles n={design.gyroType === 'heavy-duty' ? 3 : 2} /></div>
                  <div><span>Sensor Hits</span><Circles n={2} /></div>
                  <div><span>Life Support</span><Circles n={1} /></div>
                  {design.lam && <div><span>Avionics</span><Circles n={3} /></div>}
                  {design.lam && <div><span>Landing Gear</span><Circles n={3} /></div>}
                </div>
              ),
            )}
          </div>
        </Panel>

        <Panel title="Heat Data" className="area-heat">
          <table className="rs-heat-table">
            <thead><tr><th>Heat Level*</th><th className="left">Effects</th></tr></thead>
            <tbody>
              {Object.keys(HEAT_SCALE).map(Number).sort((a, b) => b - a).map((h) => (
                <tr key={h}><td>{h}</td><td className="left">{HEAT_SCALE[h]}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="rs-heat-sinks">
            <div className="rs-hs-label">Heat Sinks: <b>{s.heatSinks.total}</b> ({hsType})</div>
            <div className="rs-hs-label">Dissipation: <b>{s.heatSinks.dissipation}</b></div>
            <Circles n={s.heatSinks.total} />
          </div>
          <p className="rs-note">* All weapons: {s.heat.weapons} heat · walk +1 · run +2{s.jumpMP ? ` · jump +${Math.max(3, s.jumpMP)}` : ''}</p>
        </Panel>

        <div className="rs-heat-scale area-scale" aria-label="Heat scale">
          <div className="rs-scale-title">Heat Scale</div>
          <div className="rs-scale-overflow">Overflow</div>
          {Array.from({ length: 31 }, (_, i) => 30 - i).map((h) => (
            <div key={h} className={`rs-scale-cell ${HEAT_SCALE[h] ? 'effect' : ''}`}>{h}</div>
          ))}
        </div>

        <Panel title="Ammunition" className="area-ammo">
          <AmmoTrack rows={data.ammo} />
        </Panel>
      </div>
      <Footer />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export function VehicleRecordSheet({ design }: { design: VehicleDesign }) {
  const s = computeVehicle(design);
  const data = vehicleSheetData(design);
  const motive = MOTIVE_TYPES[design.motive];
  const isVtol = design.motive === 'vtol';
  const naval = ['naval', 'hydrofoil', 'submarine'].includes(design.motive);
  const locName = (l: VehicleArmorLocation) => (l === 'TU' ? turretName(design) : VEHICLE_LOCATION_NAMES[l]);
  const kind = isVtol ? 'VTOL Record Sheet' : naval ? 'Naval Vehicle Record Sheet' : 'Ground Vehicle Record Sheet';
  const name = `${design.chassis} ${design.model}`.trim() || 'Unnamed';
  const sides = s.armorLocations.filter((l) => l !== 'RO' && l !== 'TU');

  return (
    <article className="record-sheet vehicle">
      <SheetHeader kind={kind} name={name} />
      <div className="rs-grid-vehicle">
        <Panel title="Vehicle Data" className="area-data">
          <div className="rs-fields">
            <Field label="Type" value={name} wide />
            <div className="rs-move">
              <span className="rs-label">Movement Points:</span>
              <Field label="Cruising" value={design.cruiseMP} />
              <Field label="Flanking" value={s.flankMP} />
            </div>
            <Field label="Movement Type" value={motive.name} />
            <Field label="Engine Type" value={`${s.rating} ${VEHICLE_ENGINE_LABELS[design.engineType]}`} />
            <Field label="Tonnage" value={design.tonnage} />
            <Field label="Tech Base" value={techBase(design)} />
            <Field label="Rules Level" value={rulesLevel(design)} />
            <Field label="Era" value={eraName(design)} />
            <Field label="Battle Value" value={`≈${vehicleBV(design).total.toLocaleString('en-US')}`} />
            <Field label="Cost" value={`≈${vehicleCost(design).total.toLocaleString('en-US')} C-bills`} />
            {design.heatSinks > 0 && <Field label="Heat Sinks" value={`${design.heatSinks} (energy weapons)`} />}
            {(design.cargo ?? 0) > 0 && <Field label="Troop / Cargo" value={`${design.cargo} tons`} />}
          </div>
          <Inventory rows={data.weapons} equipment={data.equipment} showHeat={false} />
        </Panel>

        <Panel title="Armor Diagram" className="area-armor">
          <div className={`rs-vehicle-figure motive-${design.motive} ${design.turret ? 'with-turret' : ''} ${isVtol ? 'vtol' : ''}`}>
            {s.armorLocations.map((l) => (
              <div key={l} className={`rs-plate vplate-${l.toLowerCase()}`} style={{ gridArea: l.toLowerCase() }}>
                <div className="rs-plate-label">{locName(l)} <b>({design.armor[l]})</b></div>
                <Pips count={design.armor[l]} kind="armor" />
                <div className="rs-plate-is">
                  <span>IS</span> <Pips count={s.structurePoints} kind="structure" />
                </div>
              </div>
            ))}
            {!design.turret && <div className="rs-vehicle-body" style={{ gridArea: 'body' }}>{motive.name}</div>}
          </div>
          <div className="rs-armor-total">Armor: <b>{s.armorTotal}</b> · Internal structure: <b>{s.structurePoints}</b> per location</div>
        </Panel>

        <Panel title="Crew Data" className="area-crew">
          <div className="rs-fields">
            <Field label="Crew" wide />
            <Field label="Gunnery Skill" />
            <Field label={isVtol ? 'Piloting Skill' : 'Driving Skill'} />
          </div>
          <table className="rs-hits rs-crew-hits">
            <tbody>
              <tr>
                <th>Commander Hit</th><td><span className="rs-check" /></td><td>+1</td>
                <th>{isVtol ? 'Pilot' : 'Driver'} Hit</th><td><span className="rs-check" /></td><td>+2</td>
              </tr>
              <tr><td colSpan={6} className="rs-note left">Modifier to all skill rolls</td></tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="Critical Damage" className="area-crit">
          <div className="rs-crit-boxes">
            {design.turret && <div><span>{turretName(design)} Locked</span><span className="rs-check" /></div>}
            <div><span>Engine Hit</span><span className="rs-check" /></div>
            <div><span>Sensor Hits</span><span className="rs-check" /><i>+1</i><span className="rs-check" /><i>+2</i><span className="rs-check" /><i>+3</i><span className="rs-check" /><i>D</i></div>
            {!isVtol && <div><span>{naval ? 'Propulsion Hits' : 'Motive System Hits'}</span><span className="rs-check" /><i>+1</i><span className="rs-check" /><i>+2</i><span className="rs-check" /><i>+3</i></div>}
            {isVtol && <div><span>Rotor Hits</span><span className="rs-check" /><span className="rs-check" /><span className="rs-check" /></div>}
            <div className="rs-stabilizers">
              <span>Stabilizers</span>
              {sides.map((l) => <label key={l}>{VEHICLE_LOCATION_NAMES[l]} <span className="rs-check" /></label>)}
              {design.turret && <label>{turretName(design)} <span className="rs-check" /></label>}
            </div>
          </div>
        </Panel>

        <Panel title="Ammunition" className="area-ammo">
          <AmmoTrack rows={data.ammo} />
        </Panel>

        <Panel title="Notes" className="area-notes">
          <div className="rs-lines" />
        </Panel>
      </div>
      <Footer />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Support vehicles
// ---------------------------------------------------------------------------

export function SupportRecordSheet({ design }: { design: SupportVehicleDesign }) {
  const s = computeSupport(design);
  const info = SV_TYPES[design.svType];
  const name = `${design.chassis} ${design.model}`.trim() || 'Unnamed';
  const weapons: WeaponRow[] = [];
  const equipment: EquipmentRow[] = [];
  const ammo: AmmoRow[] = [];
  const groups = new Map<string, { qty: number; loc: string; id: string }>();
  for (const item of design.equipment) {
    const k = `${item.equipmentId}|${item.location}`;
    const g = groups.get(k);
    if (g) g.qty++; else groups.set(k, { qty: 1, loc: item.location ? SV_LOCATION_NAMES[item.location] : '—', id: item.equipmentId });
  }
  for (const g of groups.values()) {
    const eq = getEquipment(g.id);
    if (!eq) continue;
    if (eq.category === 'Ammo') {
      const shots = Number(/\((\d+)\)\s*$/.exec(eq.name)?.[1] ?? 0);
      for (let i = 0; i < g.qty; i++) ammo.push({ name: shortEquipmentName(eq, design), location: g.loc, shots });
    } else if (eq.isWeapon) {
      const r = eq.range;
      weapons.push({
        qty: g.qty, name: shortEquipmentName(eq, design), location: g.loc, heat: '', damage: eq.damage ?? '—',
        min: r?.min ? String(r.min) : '—', short: r ? String(r.short) : '—', medium: r ? String(r.medium) : '—', long: r?.long ? String(r.long) : '—',
      });
    } else {
      equipment.push({ qty: g.qty, name: shortEquipmentName(eq, design), location: g.loc, tons: svItemWeight(eq, design) * g.qty });
    }
  }
  const tr = design.transport;
  const seats = tr.seats + tr.pillionSeats + tr.ejectionSeats;
  const quarters = Math.floor(tr.steerage / 5) + Math.floor((tr.secondClass + tr.crewQuarters) / 7) + Math.floor(tr.firstClass / 10);
  const kind = `${info.name} Support Vehicle Record Sheet`;
  const flies = info.aero || design.svType === 'vtol';
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));
  return (
    <article className="record-sheet vehicle">
      <SheetHeader kind={kind} name={name} />
      <div className="rs-grid-vehicle">
        <Panel title="Vehicle Data" className="area-data">
          <div className="rs-fields">
            <Field label="Type" value={name} wide />
            <div className="rs-move">
              <span className="rs-label">{info.aero ? 'Thrust:' : 'Movement Points:'}</span>
              <Field label={info.aero ? 'Safe' : 'Cruising'} value={design.cruiseMP} />
              <Field label={info.aero ? 'Max' : 'Flanking'} value={s.flankMP} />
            </div>
            <Field label="Tonnage" value={`${fmt(design.tonnage)} (${s.size})`} />
            <Field label="Engine" value={SV_ENGINE_NAMES[design.engineType]} />
            <Field label="Tech Ratings" value={`Str ${design.structureTech} / Eng ${design.engineTech} / Arm ${design.armorTech}`} />
            <Field label="Tech Base" value={techBase(design)} />
            <Field label="Era" value={eraName(design)} />
            <Field label="Armor" value={`BAR ${design.bar}`} />
            {design.fuel > 0 && <Field label="Fuel" value={`${fmt(design.fuel)} t`} />}
            {design.fireControl !== 'none' && <Field label="Fire Control" value={design.fireControl === 'basic' ? 'Basic' : 'Advanced'} />}
            {design.chassisMods.length > 0 && (
              <Field label="Chassis Mods" value={design.chassisMods.map((id) => CHASSIS_MODS.find((m) => m.id === id)?.name ?? id).join(', ')} wide />
            )}
          </div>
          <Inventory rows={weapons} equipment={equipment} showHeat={false} />
        </Panel>

        <Panel title="Armor Diagram" className="area-armor">
          <div className={`rs-vehicle-figure ${info.aero ? 'aero' : ''} ${design.turret ? 'with-turret' : ''} ${design.svType === 'vtol' ? 'vtol' : ''}`}>
            {s.armorLocations.map((l) => (
              <div key={l} className={`rs-plate vplate-${l.toLowerCase()}`} style={{ gridArea: l.toLowerCase() }}>
                <div className="rs-plate-label">{SV_LOCATION_NAMES[l]} <b>({design.armor[l] ?? 0})</b></div>
                <Pips count={design.armor[l] ?? 0} kind="armor" />
              </div>
            ))}
            {!design.turret && <div className="rs-vehicle-body" style={{ gridArea: 'body' }}>{info.name}</div>}
          </div>
          <div className="rs-armor-total">Armor: <b>{s.armorTotal}</b> (BAR {design.bar})</div>
        </Panel>

        <Panel title="Crew & Cargo" className="area-crew">
          <div className="rs-fields">
            <Field label="Crew" wide />
            <Field label="Gunnery Skill" />
            <Field label={flies ? 'Piloting Skill' : 'Driving Skill'} />
          </div>
          <div className="rs-fields">
            {seats > 0 && <Field label="Seats" value={seats} />}
            {quarters > 0 && <Field label="Quarters" value={`${quarters} people`} />}
            {tr.cargo > 0 && <Field label="Cargo" value={`${fmt(tr.cargo)} t`} />}
            {tr.troops > 0 && <Field label="Troops" value={`${fmt(tr.troops)} t`} />}
          </div>
          <div className="rs-crit-boxes">
            <div><span>Commander Hit</span><span className="rs-check" /><i>+1</i></div>
            <div><span>{flies ? 'Pilot' : 'Driver'} Hit</span><span className="rs-check" /><i>+2</i></div>
          </div>
        </Panel>

        <Panel title="Critical Damage" className="area-crit">
          <div className="rs-crit-boxes">
            <div><span>Engine Hit</span><span className="rs-check" /></div>
            <div><span>Sensor Hits</span><span className="rs-check" /><i>+1</i><span className="rs-check" /><i>+2</i><span className="rs-check" /><i>+3</i><span className="rs-check" /><i>D</i></div>
            {design.svType === 'vtol' && <div><span>Rotor Hits</span><span className="rs-check" /><span className="rs-check" /><span className="rs-check" /></div>}
            {!flies && <div><span>Motive System Hits</span><span className="rs-check" /><i>+1</i><span className="rs-check" /><i>+2</i><span className="rs-check" /><i>+3</i></div>}
            {info.aero && <div><span>Avionics / Thrust</span><span className="rs-check" /><span className="rs-check" /><span className="rs-check" /></div>}
            {design.turret && <div><span>Turret Locked</span><span className="rs-check" /></div>}
          </div>
        </Panel>

        <Panel title="Ammunition" className="area-ammo">
          <AmmoTrack rows={ammo} />
        </Panel>

        <Panel title="Notes" className="area-notes">
          <div className="rs-lines" />
        </Panel>
      </div>
      <Footer />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Aerospace and conventional fighters
// ---------------------------------------------------------------------------

function FighterInventory({ rows, equipment }: { rows: FighterWeaponRow[]; equipment: EquipmentRow[] }) {
  return (
    <div className="rs-inventory">
      <div className="rs-subtitle">Weapons &amp; Equipment Inventory <span>(attack values by range bracket)</span></div>
      <table className="rs-table">
        <thead>
          <tr><th>Qty</th><th className="left">Type</th><th>Loc</th><th>Ht</th><th>SRV</th><th>MRV</th><th>LRV</th><th>ERV</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.qty}</td><td className="left">{r.name}</td><td>{r.location}</td><td>{r.heat}</td>
              {r.av.map((v, j) => <td key={j}>{v}</td>)}
            </tr>
          ))}
          {equipment.map((r, i) => (
            <tr key={`e${i}`}>
              <td>{r.qty}</td><td className="left">{r.name}</td><td>{r.location}</td><td>—</td>
              <td>[E]</td><td>—</td><td>—</td><td>—</td>
            </tr>
          ))}
          {rows.length + equipment.length === 0 && <tr><td colSpan={8} className="rs-empty">No weapons or equipment</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const FIGHTER_PLATES: [FighterArc, string][] = [['NOS', 'no'], ['LWG', 'lw'], ['RWG', 'rw'], ['AFT', 'af']];

export function FighterRecordSheet({ design }: { design: FighterDesign }) {
  const s = computeFighter(design);
  const data = fighterSheetData(design);
  const conventional = design.fighterType === 'conventional';
  const name = `${design.chassis} ${design.model}`.trim() || 'Unnamed';
  const kind = conventional ? 'Conventional Fighter Record Sheet' : 'Aerospace Fighter Record Sheet';
  return (
    <article className="record-sheet vehicle fighter">
      <SheetHeader kind={kind} name={name} />
      <div className="rs-grid-fighter">
        <Panel title="Fighter Data" className="area-data">
          <div className="rs-fields">
            <Field label="Type" value={`${name}${design.omni ? ' (OmniFighter)' : ''}`} wide />
            <div className="rs-move">
              <span className="rs-label">Thrust:</span>
              <Field label="Safe" value={design.safeThrust} />
              <Field label="Maximum" value={s.maxThrust} />
            </div>
            <Field label="Tonnage" value={design.tonnage} />
            <Field label="Tech Base" value={techBase(design)} />
            <Field label="Rules Level" value={rulesLevel(design)} />
            <Field label="Era" value={eraName(design)} />
            <Field label="Battle Value" value={fighterBV(design).total.toLocaleString('en-US')} />
            <Field label="Cost" value={`${fighterCost(design).total.toLocaleString('en-US')} C-bills`} />
            <Field label="Engine" value={`${s.rating} ${FIGHTER_ENGINE_LABELS[design.engineType]}`} />
            <Field label="Fuel" value={`${s.fuelPoints} points`} />
          </div>
          <FighterInventory rows={data.weapons} equipment={data.equipment} />
        </Panel>

        <Panel title="Armor Diagram" className="area-armor">
          <div className="rs-vehicle-figure aero">
            {FIGHTER_PLATES.map(([arc, area]) => (
              <div key={arc} className={`rs-plate vplate-${area}`} style={{ gridArea: area }}>
                <div className="rs-plate-label">
                  {FIGHTER_LOCATION_NAMES[arc]} <b>({design.armor[arc]})</b> · TH {armorThreshold(design.armor[arc])}
                </div>
                <Pips count={design.armor[arc]} kind="armor" />
              </div>
            ))}
            <div className="rs-vehicle-body rs-fighter-si" style={{ gridArea: 'body' }}>
              <span>Structural Integrity ({s.si})</span>
              <Pips count={s.si} kind="structure" />
            </div>
          </div>
          <div className="rs-armor-total">
            Armor: <b>{s.armorTotal}</b>{design.armorType !== 'standard' && ` (${FIGHTER_ARMOR_NAMES[design.armorType]})`} · SI: <b>{s.si}</b>
          </div>
        </Panel>

        <Panel title="Pilot Data" className="area-crew">
          <div className="rs-fields">
            <Field label="Name" wide />
            <Field label="Gunnery Skill" />
            <Field label="Piloting Skill" />
          </div>
          <table className="rs-hits">
            <tbody>
              <tr><th>Hits Taken</th>{CONSCIOUSNESS.map((_, i) => <td key={i}>{i + 1}</td>)}</tr>
              <tr><th>Consciousness #</th>{CONSCIOUSNESS.map((c) => <td key={c}>{c}</td>)}</tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="Critical Damage" className="area-crit">
          <div className="rs-crit-boxes">
            <div><span>Avionics</span><span className="rs-check" /><i>+1</i><span className="rs-check" /><i>+2</i><span className="rs-check" /><i>+5</i></div>
            <div><span>FCS</span><span className="rs-check" /><i>+2</i><span className="rs-check" /><i>+4</i><span className="rs-check" /><i>D</i></div>
            <div><span>Sensors</span><span className="rs-check" /><i>+1</i><span className="rs-check" /><i>+2</i><span className="rs-check" /><i>+5</i></div>
            <div><span>Engine</span><span className="rs-check" /><i>−2</i><span className="rs-check" /><i>−4</i><span className="rs-check" /><i>D</i></div>
            <div><span>Fuel Tank</span><span className="rs-check" /></div>
            <div><span>Landing Gear</span><span className="rs-check" /><i>+5</i></div>
            {!conventional && <div><span>Life Support</span><span className="rs-check" /></div>}
            <div><span>Crew</span><span className="rs-check" /><i>+1</i><span className="rs-check" /><i>+2</i></div>
          </div>
        </Panel>

        <Panel title="Heat Data" className="area-heat">
          {conventional ? (
            <p className="rs-note left">Conventional fighters are heat-neutral: {s.heatSinks.required} heat sinks for their energy weapons.</p>
          ) : (
            <>
              <div className="rs-heat-sinks">
                <div className="rs-hs-label">Heat Sinks: <b>{s.heatSinks.total}</b> ({design.heatSinkType === 'double' ? 'Double' : 'Single'})</div>
                <div className="rs-hs-label">Dissipation: <b>{s.heatSinks.dissipation}</b></div>
                <Circles n={s.heatSinks.total} />
              </div>
              <p className="rs-note">* All weapons: {s.weaponHeat} heat</p>
              <div className="rs-fighter-heat" aria-label="Heat scale">
                {Array.from({ length: 31 }, (_, i) => <span key={i}>{i}</span>)}
              </div>
            </>
          )}
        </Panel>

        <Panel title="Ammunition" className="area-ammo">
          <AmmoTrack rows={data.ammo} />
        </Panel>

        <Panel title="Velocity Record" className="area-notes">
          <table className="rs-velocity">
            <tbody>
              <tr><th>Turn #</th>{Array.from({ length: 10 }, (_, i) => <td key={i}>{i + 1}</td>)}</tr>
              <tr><th>Thrust</th>{Array.from({ length: 10 }, (_, i) => <td key={i} />)}</tr>
              <tr><th>Velocity</th>{Array.from({ length: 10 }, (_, i) => <td key={i} />)}</tr>
              <tr><th>Altitude</th>{Array.from({ length: 10 }, (_, i) => <td key={i} />)}</tr>
            </tbody>
          </table>
        </Panel>
      </div>
      <Footer />
    </article>
  );
}
