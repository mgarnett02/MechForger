import type { MechDesign } from '../rules/types';
import { parseDesign } from '../rules/edit';
import type { VehicleDesign } from '../rules/vehicle';
import { isVehicle, parseVehicle } from '../rules/vehicle';
import type { SupportVehicleDesign } from '../rules/support';
import { isSupport, parseSupport } from '../rules/support';
import type { FighterDesign } from '../rules/fighter';
import { isFighter, parseFighter } from '../rules/fighter';
import type { VesselDesign } from '../rules/vessel';
import { isVessel, parseVessel } from '../rules/vessel';
import type { BattleArmorDesign } from '../rules/battlearmor';
import { isBattleArmor, parseBattleArmor } from '../rules/battlearmor';
import type { InfantryDesign } from '../rules/infantry';
import { isInfantry, parseInfantry } from '../rules/infantry';

export type AnyDesign = MechDesign | VehicleDesign | SupportVehicleDesign | FighterDesign | VesselDesign | BattleArmorDesign | InfantryDesign;
export type UnitType = 'mech' | 'vehicle' | 'support' | 'fighter' | 'vessel' | 'battlearmor' | 'infantry';

export function unitTypeOf(d: AnyDesign): UnitType {
  return isInfantry(d) ? 'infantry' : isBattleArmor(d) ? 'battlearmor' : isVessel(d) ? 'vessel' : isFighter(d) ? 'fighter' : isSupport(d) ? 'support' : isVehicle(d) ? 'vehicle' : 'mech';
}

const KEY = 'mechforger.designs.v1';
const CURRENT = 'mechforger.current.v1';
const CURRENT_VEHICLE = 'mechforger.currentVehicle.v1';
const CURRENT_SUPPORT = 'mechforger.currentSupport.v1';
const CURRENT_FIGHTER = 'mechforger.currentFighter.v1';
const CURRENT_VESSEL = 'mechforger.currentVessel.v1';
const CURRENT_BA = 'mechforger.currentBattleArmor.v1';
const CURRENT_INF = 'mechforger.currentInfantry.v1';
const UNIT = 'mechforger.unit.v1';

/** Carry a canon design's Master Unit List id through parsing. */
function keepMul<T extends object>(raw: unknown, d: T): T {
  const id = (raw as { mulId?: unknown })?.mulId;
  return typeof id === 'number' && id > 0 ? { ...d, mulId: id } : d;
}

/** Parse a saved or imported file as whichever kind of design it is. */
export function parseAny(raw: unknown): AnyDesign {
  if (isInfantry(raw)) return keepMul(raw, parseInfantry(raw));
  if (isBattleArmor(raw)) return keepMul(raw, parseBattleArmor(raw));
  if (isVessel(raw)) return keepMul(raw, parseVessel(raw));
  if (isFighter(raw)) return keepMul(raw, parseFighter(raw));
  if (isSupport(raw)) return keepMul(raw, parseSupport(raw));
  return isVehicle(raw) ? keepMul(raw, parseVehicle(raw)) : keepMul(raw, parseDesign(raw));
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: ignore */
  }
}

export function designKey(d: AnyDesign): string {
  return `${d.chassis} ${d.model}`.trim() || 'Unnamed';
}

/** Designs saved in browser storage by older versions, before designs were saved as files. */
export function listLegacySaved(): Record<string, AnyDesign> {
  const raw = read(KEY);
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, AnyDesign> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    try {
      out[k] = parseAny(v);
    } catch {
      /* skip corrupt entries */
    }
  }
  return out;
}

export function clearLegacySaved() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: ignore */
  }
}

export function loadCurrent(): MechDesign | null {
  const raw = read(CURRENT);
  if (!raw) return null;
  try {
    return keepMul(raw, parseDesign(raw));
  } catch {
    return null;
  }
}

export function saveCurrent(d: MechDesign) {
  write(CURRENT, d);
}

export function loadCurrentVehicle(): VehicleDesign | null {
  const raw = read(CURRENT_VEHICLE);
  if (!raw) return null;
  try {
    return keepMul(raw, parseVehicle(raw));
  } catch {
    return null;
  }
}

export function saveCurrentVehicle(d: VehicleDesign) {
  write(CURRENT_VEHICLE, d);
}

export function loadUnit(): UnitType {
  const u = read(UNIT);
  return u === 'vehicle' || u === 'support' || u === 'fighter' || u === 'vessel' || u === 'battlearmor' || u === 'infantry' ? u : 'mech';
}

export function loadCurrentSupport(): SupportVehicleDesign | null {
  const raw = read(CURRENT_SUPPORT);
  if (!raw) return null;
  try {
    return keepMul(raw, parseSupport(raw));
  } catch {
    return null;
  }
}

export function saveCurrentSupport(d: SupportVehicleDesign) {
  write(CURRENT_SUPPORT, d);
}

export function loadCurrentFighter(): FighterDesign | null {
  const raw = read(CURRENT_FIGHTER);
  if (!raw) return null;
  try {
    return keepMul(raw, parseFighter(raw));
  } catch {
    return null;
  }
}

export function saveCurrentFighter(d: FighterDesign) {
  write(CURRENT_FIGHTER, d);
}

export function loadCurrentVessel(): VesselDesign | null {
  const raw = read(CURRENT_VESSEL);
  if (!raw) return null;
  try {
    return keepMul(raw, parseVessel(raw));
  } catch {
    return null;
  }
}

export function saveCurrentVessel(d: VesselDesign) {
  write(CURRENT_VESSEL, d);
}

export function loadCurrentBattleArmor(): BattleArmorDesign | null {
  const raw = read(CURRENT_BA);
  if (!raw) return null;
  try {
    return keepMul(raw, parseBattleArmor(raw));
  } catch {
    return null;
  }
}

export function saveCurrentBattleArmor(d: BattleArmorDesign) {
  write(CURRENT_BA, d);
}

export function loadCurrentInfantry(): InfantryDesign | null {
  const raw = read(CURRENT_INF);
  if (!raw) return null;
  try {
    return keepMul(raw, parseInfantry(raw));
  } catch {
    return null;
  }
}

export function saveCurrentInfantry(d: InfantryDesign) {
  write(CURRENT_INF, d);
}

export function saveUnit(unit: UnitType) {
  write(UNIT, unit);
}
