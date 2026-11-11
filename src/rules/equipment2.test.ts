import { describe, expect, it } from 'vitest';
import {
  addEquipment, computeMech, getEquipment, itemWeight, mechBV, mechCost, newDesign, setEngineType, shortEquipmentName, validate,
} from './index';
import type { MechDesign } from './types';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const weaponLine = (d: MechDesign) => mechBV(d).lines.find(([l]) => /Weapons/.test(l))![1];

describe('new lasers', () => {
  it('X-Pulse, VSP and improved heavy lasers carry MegaMek stats', () => {
    expect(getEquipment('medium-x-pulse-laser')).toMatchObject({ tons: 2, slots: 1, heat: 6, techBase: 'IS', firstEra: '3050' });
    expect(getEquipment('large-vsp-laser')).toMatchObject({ tons: 9, slots: 4, heat: 10, damage: '11/9/7', firstEra: '3068' });
    expect(getEquipment('clan-large-improved-heavy-laser')).toMatchObject({ tons: 4, slots: 3, heat: 18, techBase: 'Clan', explosiveLow: true });
    expect(shortEquipmentName(getEquipment('clan-medium-improved-heavy-laser')!, { mixedTech: false }).length).toBeLessThanOrEqual(22);
  });

  it('improved heavy lasers cost 1 BV per slot where unprotected', () => {
    const d = addEquipment(newDesign('3068', 'Clan'), 'clan-medium-improved-heavy-laser', 'CT');
    expect(mechBV(d).lines.find(([l]) => /Explosive/.test(l))?.[1]).toBe(-2);
  });
});

describe('supercharger', () => {
  const base = { ...newDesign('3068'), tonnage: 50, walkMP: 5 };

  it('weighs 10% of the engine, rounded up to the half ton, and doubles walking MP to run', () => {
    const d = addEquipment(base, 'supercharger', 'CT');
    expect(itemWeight(getEquipment('supercharger')!, d)).toBe(1.5); // 250 fusion = 12.5 t → 1.25 → 1.5
    expect(itemWeight(getEquipment('supercharger')!, setEngineType(d, 'xl'))).toBe(1); // 6.5 t → 0.65 → 1
    expect(computeMech(d).mascRunMP).toBe(10);
    expect(computeMech(addEquipment(d, 'masc', 'LT')).mascRunMP).toBe(13);
    expect(mechCost(d).total).toBeGreaterThan(mechCost(base).total);
  });

  it('must sit in a location with engine slots, one per Mech', () => {
    expect(errors(addEquipment(base, 'supercharger', 'LT')).some((m) => /supercharger must go/.test(m))).toBe(true);
    expect(errors(addEquipment(setEngineType(base, 'xl'), 'supercharger', 'LT')).some((m) => /supercharger/.test(m))).toBe(false);
    expect(errors(addEquipment(addEquipment(base, 'supercharger', 'CT'), 'supercharger', 'CT'))).toContain('Only one supercharger may be installed.');
  });

  it('raises the speed factor in BV', () => {
    expect(mechBV(addEquipment(base, 'supercharger', 'CT')).offensive).toBeGreaterThan(mechBV(base).offensive);
  });
});

describe('PPC capacitor', () => {
  it('adds BV to the linked PPC and 5 heat; needs a PPC in the same location', () => {
    const d = addEquipment(newDesign('3068'), 'ppc', 'RA');
    const capped = addEquipment(d, 'ppc-capacitor', 'RA');
    expect(weaponLine(capped) - weaponLine(d)).toBe(88);
    expect(errors(capped)).toEqual([]);
    expect(errors(addEquipment(d, 'ppc-capacitor', 'LA')).some((m) => /PPC Capacitor needs a PPC/.test(m))).toBe(true);
  });

  it('the capacitor and its PPC count as explosive (−1 per slot)', () => {
    const d = addEquipment(addEquipment(newDesign('3068'), 'ppc', 'CT'), 'ppc-capacitor', 'CT');
    expect(mechBV(d).lines.find(([l]) => /Explosive/.test(l))?.[1]).toBe(-4);
  });
});

describe('Angel ECM', () => {
  it('2 t, 2 slots, 100 BV, satisfies stealth armor', () => {
    const d = addEquipment(newDesign('3068'), 'angel-ecm', 'CT');
    expect(getEquipment('angel-ecm')).toMatchObject({ tons: 2, slots: 2 });
    expect(mechBV(d).lines.find(([l]) => /Defensive equipment/.test(l))?.[1]).toBe(100);
    expect(errors({ ...d, armorType: 'stealth' })).not.toContain('Stealth armor needs an ECM suite.');
  });
});
