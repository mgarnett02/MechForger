import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech } from '../data/canonFormat';
import { ALL_EQUIPMENT, getEquipment, shortEquipmentName } from './equipment';
import { technicalReadout } from './readout';
import { computeMech } from './construction';

const short = (id: string, mixedTech = false) => shortEquipmentName(getEquipment(id)!, { mixedTech });

describe('abbreviated item names', () => {
  it('use standard BattleTech short forms', () => {
    expect(short('ammo-machine-gun-half')).toBe('MG Ammo ½ (100)');
    expect(short('ammo-rac-5')).toBe('RAC/5 Ammo (20)');
    expect(short('uac-10')).toBe('UAC/10');
    expect(short('lb-10x')).toBe('LB 10-X');
    expect(short('medium-pulse-laser')).toBe('Med. Pulse Laser');
    expect(short('ammo-streak-srm-6')).toBe('SSRM 6 Ammo (15)');
    expect(short('targeting-computer')).toBe('Targeting Comp.');
    expect(short('clan-er-large-laser', true)).toBe('ER Large Laser (C)');
  });

  it('leave short names alone', () => {
    for (const id of ['medium-laser', 'ppc', 'ac-20', 'lrm-15', 'er-medium-laser', 'hatchet']) {
      expect(short(id)).toBe(getEquipment(id)!.name);
    }
  });

  it('keep every item within about 22 characters', () => {
    const longest = Math.max(...ALL_EQUIPMENT.map((e) => shortEquipmentName(e, { mixedTech: false }).length));
    expect(longest).toBeLessThanOrEqual(22);
  });

  it('show in critical slots, with the full name kept for tooltips', () => {
    const d = decodeMech((mechs as CanonEntry[]).find((e) => e.n === 'Goliath GOL-5D')!.d);
    const slot = computeMech(d).slots.LT.slots.find((x) => x.fullName === 'Rotary AC/5 Ammo (20)')!;
    expect(slot.label).toBe('RAC/5 Ammo (20)');
  });

  it('keep the readout columns aligned', () => {
    const d = decodeMech((mechs as CanonEntry[]).find((e) => e.n === 'Goliath GOL-5D')!.d);
    const text = technicalReadout(d);
    const header = text.split('\n').find((l) => l.startsWith('Weapons and Ammo'))!;
    const locCol = header.indexOf('Loc');
    const rows = text.split('\n').slice(text.split('\n').indexOf(header) + 1).filter((l) => / (LT|RT|CT|HD|RLL|RRL) /.test(l));
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) {
      expect(r[locCol - 1]).toBe(' '); // a space always separates the name from the location
      expect(r.slice(locCol, locCol + 3).trim()).toMatch(/^(LT|RT|CT|HD|RLL|RRL)$/);
    }
    expect(text).toContain('MG Ammo ½ (100)');
  });
});
