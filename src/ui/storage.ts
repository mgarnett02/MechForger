import type { MechDesign } from '../rules/types';
import { parseDesign } from '../rules/edit';
import type { VehicleDesign } from '../rules/vehicle';
import { isVehicle, parseVehicle } from '../rules/vehicle';

export type AnyDesign = MechDesign | VehicleDesign;
export type UnitType = 'mech' | 'vehicle';

const KEY = 'mechforger.designs.v1';
const CURRENT = 'mechforger.current.v1';
const CURRENT_VEHICLE = 'mechforger.currentVehicle.v1';
const UNIT = 'mechforger.unit.v1';

/** Parse a saved or imported file as whichever kind of design it is. */
export function parseAny(raw: unknown): AnyDesign {
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

export function listSaved(): Record<string, AnyDesign> {
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

export function saveDesign(d: AnyDesign) {
  const raw = (read(KEY) as Record<string, unknown>) ?? {};
  write(KEY, { ...raw, [designKey(d)]: d });
}

export function deleteSaved(key: string) {
  const raw = { ...((read(KEY) as Record<string, unknown>) ?? {}) };
  delete raw[key];
  write(KEY, raw);
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

export function downloadJson(d: AnyDesign) {
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${designKey(d).replace(/[^\w-]+/g, '_')}.${isVehicle(d) ? 'vehicle' : 'mech'}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
  return read(UNIT) === 'vehicle' ? 'vehicle' : 'mech';
}

export function saveUnit(unit: UnitType) {
  write(UNIT, unit);
}
