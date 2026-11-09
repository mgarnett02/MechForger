import type { MechDesign } from '../rules/types';
import { parseDesign } from '../rules/edit';
import type { VehicleDesign } from '../rules/vehicle';
import { isVehicle, parseVehicle } from '../rules/vehicle';
import type { SupportVehicleDesign } from '../rules/support';
import { isSupport, parseSupport } from '../rules/support';

export type AnyDesign = MechDesign | VehicleDesign | SupportVehicleDesign;
export type UnitType = 'mech' | 'vehicle' | 'support';

export function unitTypeOf(d: AnyDesign): UnitType {
  return isSupport(d) ? 'support' : isVehicle(d) ? 'vehicle' : 'mech';
}

const KEY = 'mechforger.designs.v1';
const CURRENT = 'mechforger.current.v1';
const CURRENT_VEHICLE = 'mechforger.currentVehicle.v1';
const CURRENT_SUPPORT = 'mechforger.currentSupport.v1';
const UNIT = 'mechforger.unit.v1';

/** Parse a saved or imported file as whichever kind of design it is. */
export function parseAny(raw: unknown): AnyDesign {
  if (isSupport(raw)) return parseSupport(raw);
  return isVehicle(raw) ? parseVehicle(raw) : parseDesign(raw);
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
    return parseDesign(raw);
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
    return parseVehicle(raw);
  } catch {
    return null;
  }
}

export function saveCurrentVehicle(d: VehicleDesign) {
  write(CURRENT_VEHICLE, d);
}

export function loadUnit(): UnitType {
  const u = read(UNIT);
  return u === 'vehicle' || u === 'support' ? u : 'mech';
}

export function loadCurrentSupport(): SupportVehicleDesign | null {
  const raw = read(CURRENT_SUPPORT);
  if (!raw) return null;
  try {
    return parseSupport(raw);
  } catch {
    return null;
  }
}

export function saveCurrentSupport(d: SupportVehicleDesign) {
  write(CURRENT_SUPPORT, d);
}

export function saveUnit(unit: UnitType) {
  write(UNIT, unit);
}
