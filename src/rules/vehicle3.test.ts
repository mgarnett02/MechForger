import { describe, expect, it } from 'vitest';
import V from '../data/canon/vehicles.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeVehicle } from '../data/canonFormat';
import {
  addVehicleItem, computeVehicle, newVehicle, parseVehicle, setVehicleDualTurret, setVehicleItemLocation, setVehicleItemSponson,
  setVehicleSponsons, validateVehicle, vehicleArmorLocations, vehicleSlotsUsed,
} from './vehicle';
import type { VehicleDesign } from './vehicle';
import { vehicleBV, vehicleCost } from './battleValue';

const errors = (d: VehicleDesign) => validateVehicle(d).filter((i) => i.severity === 'error').map((i) => i.message);
const canon = (n: string) => decodeVehicle((V as CanonEntry[]).find((e) => e.n === n)!.d);
const tank = (over: Partial<VehicleDesign> = {}): VehicleDesign => ({ ...newVehicle('3081'), tonnage: 50, cruiseMP: 4, engineType: 'standard', heatSinks: 10, ...over });
const place = (d: VehicleDesign, id: string, loc: VehicleDesign['equipment'][number]['location']) => {
  const n = addVehicleItem(d, id);
  return setVehicleItemLocation(n, n.equipment[n.equipment.length - 1].uid, loc);
};

describe('dual turrets', () => {
  it('a front turret: its own armor location and 10% of its weapons', () => {
    let d = setVehicleDualTurret(tank(), true);
    expect(d.turret).toBe(true);
    expect(vehicleArmorLocations(d)).toContain('TU2');
    d = place(place(d, 'ppc', 'TU'), 'ppc', 'TU2');
    expect(computeVehicle(d).weights.turret).toBe(1 + 1); // 0.7 → 1 each
    expect(errors({ ...d, motive: 'vtol' })).toContain('VTOLs cannot have dual turrets.');
    expect(parseVehicle(JSON.parse(JSON.stringify(d))).dualTurret).toBe(true);
    expect(setVehicleDualTurret(d, false).equipment.some((e) => e.location === 'TU2')).toBe(false);
  });

  it('canon dual-turret tanks match MegaMek', () => {
    const goblin = canon('Goblin Medium Tank X');
    expect(goblin.dualTurret).toBe(true);
    expect(vehicleBV(goblin).total).toBe(898);
  });
});

describe('sponson turrets', () => {
  it('weigh 10% of the sponson weapons, cost 4,000 a ton, and need side mounts', () => {
    let d = setVehicleSponsons(tank(), true);
    d = place(place(d, 'machine-gun', 'LS'), 'machine-gun', 'RS');
    for (const e of d.equipment) d = setVehicleItemSponson(d, e.uid, true);
    expect(computeVehicle(d).weights.sponsons).toBe(0.5);
    expect(vehicleCost(d).lines.find(([k]) => k === 'Sponson turrets')?.[1]).toBe(2000);
    const front = setVehicleItemLocation(d, d.equipment[0].uid, 'FR');
    expect(errors(front)).toContain('Sponson turret weapons must be mounted on a side.');
    expect(errors(setVehicleSponsons({ ...d, sponsons: false }, false))).not.toContain('Equipment is marked for sponson turrets but the vehicle has none.');
  });

  it('canon sponson tanks load at their weight', () => {
    const d = canon('Fensalir Combat WiGE (XXL)');
    expect(d.sponsons).toBe(true);
    expect(d.equipment.filter((e) => e.sponson)).toHaveLength(4);
    expect(computeVehicle(d).weights.free).toBe(0);
  });
});

describe('vehicle jump jets and VTOL jet boosters', () => {
  it('jump jets weigh as for a \'Mech, share one slot, need ground movement and no more jump than cruise MP', () => {
    let d = tank({ motive: 'hover', cruiseMP: 6 });
    const base = vehicleSlotsUsed(d);
    for (let k = 0; k < 4; k++) d = addVehicleItem(d, 'vehicle-jump-jet');
    expect(computeVehicle(d).weights.equipment).toBe(2); // 4 × 0.5 t at 50 tons
    expect(computeVehicle(d).jumpMP).toBe(4);
    expect(vehicleSlotsUsed(d)).toBe(base + 1);
    expect(errors(d).filter((m) => /jump/i.test(m))).toEqual([]);
    expect(errors({ ...d, cruiseMP: 3 })).toContain('Jumping MP (4) cannot exceed cruising MP (3).');
    expect(errors({ ...d, motive: 'naval' }).some((m) => /hover, wheeled, tracked and WiGE/.test(m))).toBe(true);
    expect(errors(setVehicleSponsons(d, true))).toContain('Vehicle jump jets cannot be combined with sponson turrets.');
    expect(vehicleBV(d).total).toBeGreaterThan(vehicleBV(tank({ motive: 'hover', cruiseMP: 6 })).total);
  });

  it('a VTOL jet booster weighs 10% of the engine and doubles cruise MP for flanking', () => {
    const d = addVehicleItem(tank({ motive: 'vtol', tonnage: 30, cruiseMP: 7 }), 'vtol-jet-booster');
    const s = computeVehicle(d);
    expect(s.boostedFlankMP).toBe(14);
    expect(errors({ ...d, motive: 'tracked' })).toContain('Only VTOLs can mount a jet booster.');
    expect(vehicleCost(d).total).toBeGreaterThan(vehicleCost({ ...d, equipment: [] }).total);
  });

  it('canon jump tanks and boosted VTOLs are legal', () => {
    for (const n of ['Saladin Assault Hover Tank Ifrit', 'Hephaestus Jump Tank', 'Strix Stealth VTOL']) expect(errors(canon(n)), n).toEqual([]);
  });
});

describe('vehicle fixes found against MegaMek', () => {
  it('stealth armor adds 10 heat; VTOL chin turret armor is read; superchargers double cruise MP for BV', () => {
    expect(computeVehicle(canon('Strix Stealth VTOL')).energyHeat).toBe(14);
    expect(canon('Garuda Heavy VTOL').armor.TU).toBe(20);
    expect(vehicleBV(canon('Hanse MBT')).total).toBe(1537);
    expect(vehicleBV(canon('Maxim Flanker')).total).toBe(581); // rear outguns front: sides count half
  });
});
