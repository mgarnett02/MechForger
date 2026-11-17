import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import mechs from '../../data/canon/mechs.json';
import vehicles from '../../data/canon/vehicles.json';
import protomechs from '../../data/canon/protomechs.json';
import type { CanonEntry } from '../../data/canonFormat';
import { decodeMech, decodeProtoMech, decodeVehicle } from '../../data/canonFormat';
import { MechRecordSheet, ProtoMechRecordSheet, VehicleRecordSheet } from './RecordSheets';

const find = (list: unknown, name: string) => (list as CanonEntry[]).find((e) => e.n === name)!.d;
const construction = (html: string) => /Construction:<\/span><span class="rs-value">([^<]*)</.exec(html)?.[1];

describe('record sheet legality', () => {
  it('prints Legal or Illegal', () => {
    expect(construction(renderToStaticMarkup(createElement(MechRecordSheet, { design: decodeMech(find(mechs, 'Atlas AS7-D')) })))).toBe('Legal');
    expect(construction(renderToStaticMarkup(createElement(VehicleRecordSheet, { design: decodeVehicle(find(vehicles, 'Ajax Assault Tank C')) })))).toBe('Illegal');
    expect(construction(renderToStaticMarkup(createElement(ProtoMechRecordSheet, { design: decodeProtoMech(find(protomechs, 'Svartalfa 3')) })))).toBe('Illegal');
  });

  it('names the Illegal Design quirk', () => {
    const html = renderToStaticMarkup(createElement(MechRecordSheet, { design: decodeMech(find(mechs, 'Malice MAL-Y-SH-RISC')) }));
    expect(construction(html)).toBe('Illegal (Illegal Design quirk)');
  });
});
