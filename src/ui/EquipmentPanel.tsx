import { useState } from 'react';
import type { Location, MechDesign, MountedItem } from '../rules/types';
import { SPLIT_ADJACENT, isQuad, locationName } from '../rules/types';
import type { MechSummary } from '../rules/construction';
import type { Equipment, EquipmentCategory } from '../rules/equipment';
import {
  ALL_EQUIPMENT, FILLER_IDS, allowedLocations, armoredComponentsAllowed, canArmor, canRearMount, equipmentName, getEquipment,
  isCatalogEquipment, itemSlots, itemWeight, legCount,
} from '../rules/equipment';
import { meleeDamage } from '../rules/melee';
import { actuatorFits, addEquipment, canSplit, hasMechTurret, removeEquipment, setItemArmored, setItemLocation, setItemRear, setItemSplit, setItemTurret } from '../rules/edit';
import { activeConfigName, isFixedOnly, setItemPod } from '../rules/omni';
import { OmniBar } from './OmniBar';
import { isActuatorId } from '../rules/actuators';

interface Props {
  design: MechDesign;
  summary: MechSummary;
  update: (fn: (d: MechDesign) => MechDesign) => void;
  selected: string | null;
  setSelected: (uid: string | null) => void;
}

const TABS: { id: EquipmentCategory; label: string }[] = [
  { id: 'Energy', label: 'Energy' },
  { id: 'Ballistic', label: 'Ballistic' },
  { id: 'Missile', label: 'Missile' },
  { id: 'Ammo', label: 'Ammo' },
  { id: 'Physical', label: 'Melee' },
  { id: 'Other', label: 'Equipment' },
  { id: 'Utility', label: 'Industrial' },
];

function rangeText(eq: Equipment): string {
  if (!eq.range) return '—';
  const { min, short, medium, long } = eq.range;
  return `${min ? `(${min}) ` : ''}${short}/${medium}/${long || '—'}`;
}

export function EquipmentPanel({ design, summary, update, selected, setSelected }: Props) {
  const [tab, setTab] = useState<EquipmentCategory>('Energy');
  // Lower arm and hand actuators are offered with the equipment (bipeds and tripods only).
  const available = ALL_EQUIPMENT.filter(
    (e) => (!e.managed || (isActuatorId(e.id) && !isQuad(design))) && !e.capitalClass && !e.vehicleChassisMod && !e.vehicleOnly && !e.vesselOnly && (!e.lamOnly || !!design.lam)
      // Hidden: anything the era or its rules level does not allow (Introductory 3025: the classic weapons only).
      && (isActuatorId(e.id) || isCatalogEquipment(e, design.era, design.techBase, design.mixedTech)),
  );
  const tabs = TABS.filter((t) => available.some((e) => e.category === t.id));
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'Energy';
  const catalog = available.filter((e) => e.category === activeTab);
  const mountedIds = new Set(design.equipment.map((e) => e.equipmentId));
  const showCombat = activeTab !== 'Ammo';

  const items = design.equipment.filter((e) => !FILLER_IDS.includes(e.equipmentId));
  const fillers = FILLER_IDS.map((id) => ({
    eq: getEquipment(id)!,
    all: design.equipment.filter((e) => e.equipmentId === id),
  })).filter((f) => f.all.length > 0);

  return (
    <section className="panel">
      <h2>Equipment</h2>
      <OmniBar design={design} summary={summary} update={update} />
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={activeTab === t.id}
            className={activeTab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="table-scroll">
        <table className="catalog">
          <thead>
            <tr>
              <th>Name</th>
              {showCombat && <><th className="c">Dmg</th><th className="c">Heat</th><th>Range</th></>}
              <th className="c">Tons</th><th className="num">Crits</th><th />
            </tr>
          </thead>
          <tbody>
            {catalog.map((eq) => {
              // Talons are bought as a set (one per leg).
              const tons = eq.melee === 'talons' ? itemWeight(eq, design) * legCount(design) : itemWeight(eq, design);
              const noArms = !!eq.armOnly && isQuad(design);
              const tooHeavy = tons > summary.weights.free;
              // One lower arm and one hand actuator per arm.
              const bothArms = isActuatorId(eq.id) && design.equipment.filter((e) => e.equipmentId === eq.id).length >= 2;
              return (
                <tr key={eq.id} className={eq.ammoFor && !mountedIds.has(eq.ammoFor) ? 'dim' : ''}>
                  <td>{equipmentName(eq, design)}</td>
                  {showCombat && (
                    <>
                      <td className="c">{eq.melee ? meleeDamage(eq.melee, design.tonnage) : eq.damage ?? '—'}</td>
                      <td className="c">{eq.heat}</td>
                      <td>{rangeText(eq)}</td>
                    </>
                  )}
                  <td className="c">{tons}</td>
                  <td className="num">{itemSlots(eq, design)}{eq.melee === 'talons' ? ' / leg' : ''}</td>
                  <td>
                    <button className="small" disabled={tooHeavy || noArms || bothArms}
                      title={noArms ? 'Arm-mounted: quads have no arms' : bothArms ? 'Both arms already have one' : tooHeavy ? 'Not enough free tonnage'
                        : eq.melee === 'talons' ? 'Fits talons to every leg' : 'Add to mech'}
                      onClick={() => update((d) => addEquipment(d, eq.id))}>Add</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Mounted <span className="muted small">({items.length} items)</span></h3>
      {items.length === 0 && fillers.length === 0 && <p className="muted">Nothing mounted yet.</p>}
      <ul className="mounted">
        {design.omni && <li className="mounted-heading">Fixed (all configurations)</li>}
        {items.filter((i) => !i.pod && !(design.omni && isActuatorId(i.equipmentId))).map((item) => (
          <MountedRow key={item.uid} item={item} design={design} summary={summary} update={update}
            selected={selected} setSelected={setSelected} />
        ))}
        {fillers.map(({ eq, all }) => {
          const placed = all.filter((e) => e.location !== null).length;
          const next = all.find((e) => e.location === null);
          return (
            <li key={eq.id} className={placed < all.length ? 'unallocated' : ''}>
              <strong>{eq.name}</strong>
              <span className="muted small">
                {all.length} slots spread over the mech · {placed} placed
              </span>
              <span className="spacer" />
              {next && (
                <button className="small" onClick={() => setSelected(next.uid)}
                  title="Select, then click a location in the critical slot diagram">
                  Place next
                </button>
              )}
            </li>
          );
        })}
        {design.omni && <li className="mounted-heading">Pods — {activeConfigName(design)} configuration</li>}
        {items.filter((i) => i.pod || (design.omni && isActuatorId(i.equipmentId))).map((item) => (
          <MountedRow key={item.uid} item={item} design={design} summary={summary} update={update}
            selected={selected} setSelected={setSelected} />
        ))}
      </ul>
    </section>
  );
}

function MountedRow({
  item, design, summary, update, selected, setSelected,
}: { item: MountedItem } & Props) {
  const eq = getEquipment(item.equipmentId);
  if (!eq) return null;
  return (
    <li className={`${item.location ? '' : 'unallocated'} ${selected === item.uid ? 'selected' : ''}`}>
      <span className="item-name">
        <button className="link" title="Select, then click a location in the critical slot diagram"
          onClick={() => setSelected(selected === item.uid ? null : item.uid)}>
          {equipmentName(eq, design)}
        </button>
        <span className="muted small">{itemWeight(eq, design)} t · {itemSlots(eq, design)} crit</span>
      </span>
      <span className="spacer" />
      <select aria-label={`${eq.name} location`} value={item.location ?? ''}
        onChange={(e) => update((d) => setItemLocation(d, item.uid, (e.target.value || null) as Location | null))}>
        <option value="">— unallocated —</option>
        {allowedLocations(eq, design).filter((loc) => loc === item.location || actuatorFits(design, item.uid, loc)).map((loc) => (
          <option key={loc} value={loc}>
            {locationName(design, loc)} ({summary.slots[loc].free} free)
          </option>
        ))}
      </select>
      {canSplit(eq) && item.location && (
        <SplitControl item={item} eq={eq} design={design} update={update} />
      )}
      {canRearMount(eq, item.location, design) && (
        <label className="check small">
          <input type="checkbox" checked={!!item.rear}
            onChange={(e) => update((d) => setItemRear(d, item.uid, e.target.checked))} />
          Rear
        </label>
      )}
      {item.location && eq.variableWeight !== 'mechTurret' && eq.category !== 'Ammo' && hasMechTurret(design, item.location) && (
        <label className="check small" title="Mounted in the turret: fires in every direction; the turret weighs a tenth of what it carries">
          <input type="checkbox" checked={!!item.turret}
            onChange={(e) => update((d) => setItemTurret(d, item.uid, e.target.checked))} />
          Turret
        </label>
      )}
      {canArmor(eq) && item.location && (
        <label className="check small" title={armoredComponentsAllowed(design) ? 'Armored component: +0.5 t per slot, from 3061'
          : design.tonnage > 100 ? "Superheavy 'Mechs cannot have armored components" : 'Armored components are available from 3061 (Clan Invasion era)'}>
          <input type="checkbox" checked={!!item.armored} disabled={!item.armored && !armoredComponentsAllowed(design)}
            onChange={(e) => update((d) => setItemArmored(d, item.uid, e.target.checked))} />
          Armored
        </label>
      )}
      {design.omni && !isFixedOnly(eq.id) && (
        <label className="check small" title="Pod-mounted equipment belongs to this configuration only">
          <input type="checkbox" checked={!!item.pod}
            onChange={(e) => update((d) => setItemPod(d, item.uid, e.target.checked))} />
          Pod
        </label>
      )}
      <button className="small danger" aria-label={`Remove ${eq.name}`}
        onClick={() => update((d) => removeEquipment(d, item.uid))}>✕</button>
    </li>
  );
}

/** Split a weapon of 8+ slots: choose the adjacent location and how many slots go there. */
function SplitControl({ item, eq, design, update }: { item: MountedItem; eq: Equipment; design: MechDesign; update: Props['update'] }) {
  const total = itemSlots(eq, design);
  const options = SPLIT_ADJACENT[item.location!].filter((l) => allowedLocations(eq, design).includes(l));
  if (!options.length) return null;
  const split = item.split;
  return (
    <span className="split-control small" title="Weapons of 8 or more slots may be split into an adjacent location">
      <select aria-label={`${eq.name} split location`} value={split?.location ?? ''}
        onChange={(e) => {
          const loc = e.target.value as Location | '';
          update((d) => setItemSplit(d, item.uid, loc ? { location: loc, slots: split?.slots ?? Math.floor(total / 2) } : null));
        }}>
        <option value="">Not split</option>
        {options.map((l) => <option key={l} value={l}>Split into {locationName(design, l)}</option>)}
      </select>
      {split && (
        <select aria-label={`${eq.name} slots in ${locationName(design, split.location)}`} value={split.slots}
          onChange={(e) => update((d) => setItemSplit(d, item.uid, { location: split.location, slots: Number(e.target.value) }))}>
          {Array.from({ length: total - 1 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} slot{n > 1 ? 's' : ''} there</option>)}
        </select>
      )}
    </span>
  );
}
