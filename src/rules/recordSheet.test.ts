import { describe, expect, it } from 'vitest';
import { ammoShots, getEquipment, mechSheetData, vehicleSheetData, HEAT_SCALE } from './index';
import { PRESETS } from '../data/canonical';
import { VEHICLE_PRESETS } from '../data/vehicles';

const mech = (k: string) => PRESETS.find((p) => p.key.startsWith(k))!.build();
const vehicle = (k: string) => VEHICLE_PRESETS.find((p) => p.key.startsWith(k))!.build();

describe('record sheet data', () => {
  it('groups identical weapons per location, rear-mounted separately', () => {
    const { weapons } = mechSheetData(mech('Atlas'));
    const ml = weapons.filter((w) => w.name.startsWith('Medium Laser'));
    expect(ml.map((w) => [w.qty, w.name, w.location])).toEqual([
      [2, 'Medium Laser (R)', 'CT'],
      [1, 'Medium Laser', 'LA'],
      [1, 'Medium Laser', 'RA'],
    ]);
    const lrm = weapons.find((w) => w.name === 'LRM 20')!;
    expect(lrm).toMatchObject({ heat: '6', min: '6', short: '7', medium: '14', long: '21' });
    const ac = weapons.find((w) => w.name === 'AC/20')!;
    expect(ac.min).toBe('—');
  });

  it('lists every ammo bin with its shots', () => {
    const { ammo } = mechSheetData(mech('Atlas'));
    expect(ammo.filter((a) => a.name.startsWith('AC/20'))).toHaveLength(2);
    expect(ammo.find((a) => a.name.startsWith('SRM 6'))!.shots).toBe(15);
    expect(ammoShots(getEquipment('ammo-machine-gun-half')!)).toBe(100);
    expect(ammoShots(getEquipment('ammo-mml-9-srm')!)).toBe(11);
  });

  it('separates non-weapon equipment', () => {
    const d = mech('Warden');
    expect(mechSheetData(d).equipment.map((e) => e.name)).toEqual(['CASE']);
  });

  it('vehicles: locations by name, heat only for energy weapons', () => {
    const { weapons, ammo } = vehicleSheetData(vehicle('Harbor'));
    expect(weapons.find((w) => w.name === 'LRM 15')!.location).toBe('Turret');
    expect(weapons.find((w) => w.name === 'Medium Laser')).toMatchObject({ qty: 2, location: 'Front', heat: '3' });
    expect(weapons.find((w) => w.name === 'SRM 6')!.heat).toBe('0');
    expect(ammo.every((a) => a.location === 'Body')).toBe(true);
    expect(vehicleSheetData(vehicle('Gadfly')).weapons.length).toBe(2);
  });

  it('heat scale has the standard thresholds', () => {
    expect(HEAT_SCALE[5]).toBe('−1 Movement Points');
    expect(HEAT_SCALE[30]).toBe('Shutdown');
    expect(Object.keys(HEAT_SCALE)).toHaveLength(17);
  });
});
