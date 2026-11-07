import type { Location, MechDesign } from '../rules/types';
import { LOCATION_NAMES } from '../rules/types';
import type { MechSummary } from '../rules/construction';
import { allowedLocations, equipmentName, getEquipment, itemSlots } from '../rules/equipment';
import { autoAllocate, setItemLocation } from '../rules/edit';

interface Props {
  design: MechDesign;
  summary: MechSummary;
  update: (fn: (d: MechDesign) => MechDesign) => void;
  selected: string | null;
  setSelected: (uid: string | null) => void;
}

const AREAS: Record<Location, string> = {
  LA: 'la', LT: 'lt', HD: 'hd', CT: 'ct', RT: 'rt', RA: 'ra', LL: 'll', RL: 'rl',
};

export function CritPanel({ design, summary, update, selected, setSelected }: Props) {
  const selItem = design.equipment.find((e) => e.uid === selected);
  const selEq = selItem ? getEquipment(selItem.equipmentId) : undefined;
  const selSlots = selEq ? itemSlots(selEq, design) : 0;
  const canPlace = (loc: Location) =>
    !!selEq && allowedLocations(selEq).includes(loc) && summary.slots[loc].free >= selSlots;

  // One chip per kind of unallocated item (e.g. "Endo Steel ×14").
  const groups: { id: string; items: typeof summary.unallocated }[] = [];
  for (const item of summary.unallocated) {
    const g = groups.find((x) => x.id === item.equipmentId);
    if (g) g.items.push(item);
    else groups.push({ id: item.equipmentId, items: [item] });
  }

  const place = (loc: Location) => {
    if (!selItem || !selEq || !allowedLocations(selEq).includes(loc)) return;
    update((d) => setItemLocation(d, selItem.uid, loc));
    // Move on to the next unallocated item, preferring another of the same kind.
    const rest = design.equipment.filter((e) => e.location === null && e.uid !== selItem.uid);
    const next = rest.find((e) => e.equipmentId === selItem.equipmentId) ?? rest[0];
    setSelected(next?.uid ?? null);
  };

  return (
    <section className="panel">
      <h2>Critical slots</h2>
      {groups.length > 0 && (
        <div className="unallocated-bar">
          <span className="muted small">Unallocated — pick one, then click a location:</span>
          {groups.map(({ id, items }) => {
            const eq = getEquipment(id);
            const active = items.some((i) => i.uid === selected);
            return (
              <button key={id} className={`chip ${active ? 'active' : ''}`}
                onClick={() => setSelected(active ? null : items[0].uid)}>
                {eq ? equipmentName(eq, design) : id}{items.length > 1 ? ` ×${items.length}` : ''}
              </button>
            );
          })}
          <span className="spacer" />
          <button className="small" title="Place every unallocated item in the first location with room"
            onClick={() => { update(autoAllocate); setSelected(null); }}>Auto-allocate</button>
        </div>
      )}
      {selEq && (
        <p className="small">
          Placing <strong>{equipmentName(selEq, design)}</strong> ({selSlots} slot{selSlots > 1 ? 's' : ''}).{' '}
          <button className="link" onClick={() => setSelected(null)}>Cancel</button>
        </p>
      )}
      <div className="crit-grid">
        {(Object.keys(AREAS) as Location[]).map((loc) => {
          const s = summary.slots[loc];
          const placeable = canPlace(loc);
          const blocked = !!selEq && !placeable;
          return (
            <div key={loc} style={{ gridArea: AREAS[loc] }}
              className={`crit-loc ${placeable ? 'placeable' : ''} ${blocked ? 'blocked' : ''} ${s.overflow ? 'over' : ''}`}
              onClick={() => placeable && place(loc)}>
              <div className="crit-head">
                <span>{LOCATION_NAMES[loc]}</span>
                <span className="muted small">{s.overflow ? `+${s.overflow} over` : `${s.free} free`}</span>
              </div>
              <ol className="slots">
                {s.slots.map((slot, i) => (
                  <li key={i} className={`slot ${slot.kind} ${slot.uid && slot.uid === selected ? 'selected' : ''} ${slot.kind === 'item' && !slot.first ? 'cont' : ''}`}>
                    <span className="idx">{(i % 6) + 1}</span>
                    {slot.kind === 'item' ? (
                      <button className="slot-btn" title="Click to unallocate"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selEq) { if (placeable) place(loc); return; }
                          update((d) => setItemLocation(d, slot.uid!, null));
                        }}>
                        {slot.label}
                      </button>
                    ) : (
                      <span>{slot.label}</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
