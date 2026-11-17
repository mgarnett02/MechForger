import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import vehicles from '../data/canon/vehicles.json';
import fighters from '../data/canon/fighters.json';
import support from '../data/canon/support.json';
import battlearmor from '../data/canon/battlearmor.json';
import stationary from '../data/canon/stationary.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeBattleArmor, decodeFighter, decodeMech, decodeStationary, decodeSupport, decodeVehicle } from '../data/canonFormat';
import { validate } from './validation';
import { validateVehicle } from './vehicle';
import { validateFighter } from './fighter';
import { computeSupport, validateSupport } from './support';
import { validateBattleArmor } from './battlearmor';
import { validateStationary } from './stationary';

const find = (list: unknown, name: string) => (list as CanonEntry[]).find((e) => e.n === name)!.d;
const errors = (issues: { severity: string; message: string }[]) => issues.filter((i) => i.severity === 'error').map((i) => i.message);

// Canon units MegaMek accepts that MechForger used to reject.
describe('canon units MegaMek accepts', () => {
  it('honours the Illegal Design quirk: rule breaches become warnings', () => {
    for (const n of ['Carbine CON-9M-D ConstructionMech MOD', 'Crosscut IIC SolahmaMech', 'Malice MAL-Y-SH-RISC']) {
      const d = decodeMech(find(mechs, n));
      expect(d.illegalDesign).toBe(true);
      expect(errors(validate(d))).toEqual([]);
      expect(errors(validate({ ...d, illegalDesign: undefined })).length).toBeGreaterThan(0);
    }
  });

  it('loads units carrying the other tech base\'s equipment as mixed tech', () => {
    for (const n of ['Highlander HGN-732 (Colleen)', 'Stag II ST-24G', 'Huntsman (Nobori-nin)', 'Osteon']) {
      const d = decodeMech(find(mechs, n));
      expect(errors(validate(d))).toEqual([]);
    }
    for (const n of ['Eldingar Hover Sled (Streak)', "Huitzilopochtli Assault Tank 'Huey' (AAA)"]) {
      const d = decodeVehicle(find(vehicles, n));
      expect(d.mixedTech).toBe(true);
      expect(errors(validateVehicle(d))).toEqual([]);
    }
    expect(errors(validateFighter(decodeFighter(find(fighters, 'Issus 3'))))).toEqual([]);
    expect(errors(validateStationary(decodeStationary(find(stationary, 'Micro Pulse Laser Turret (Single)'))))).toEqual([]);
  });

  it('follows MegaMek on mixed double heat sinks, MASC in the head, missing armor slots and industrial patchwork', () => {
    for (const n of ['Cougar X 3', 'Locust LCT-6M', 'Great Wyrm 2', 'Shogun C 2', 'Spindrift Aquatic SecurityMech SDT-1']) {
      expect(errors(validate(decodeMech(find(mechs, n)))), n).toEqual([]);
    }
  });

  it('weighs insulated cargo bays by weight, not capacity', () => {
    const d = decodeVehicle(find(vehicles, 'Coolant Truck 135-K'));
    expect(d.cargo).toBe(9);
    expect(errors(validateVehicle(d))).toEqual([]);
  });

  it('lets support vehicles mount vehicle jump jets, the armored motive system and part-squad battle armor bays', () => {
    const shackleton = decodeSupport(find(support, 'Shackleton AESV'));
    expect(computeSupport(shackleton).weights.free).toBe(0);
    expect(errors(validateSupport(shackleton))).toEqual([]);
    expect(errors(validateSupport(decodeSupport(find(support, 'Trireme Infantry Transport'))))).toEqual([]);
  });

  it('spreads the BA myomer booster one slot per piece', () => {
    for (const n of ['Fa Shih Battle Armor 2 [MG](Sqd4)', "Groundhog Exoskeleton 'Master Thief'(Sqd1)"]) {
      expect(errors(validateBattleArmor(decodeBattleArmor(find(battlearmor, n)))), n).toEqual([]);
    }
  });
});
