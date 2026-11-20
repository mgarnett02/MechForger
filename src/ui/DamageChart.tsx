import { useMemo, useRef, useState } from 'react';
import type { MechDesign } from '../rules/types';
import type { MechSummary } from '../rules/construction';
import type { Bracket, RangePoint } from '../rules/damage';
import { BASE_TO_HIT, damageByRange } from '../rules/damage';

interface Props {
  design: MechDesign;
  summary: MechSummary;
}

const W = 400;
const H = 190;
const M = { top: 10, right: 12, bottom: 26, left: 34 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;
const BRACKETS: Bracket[] = ['short', 'medium', 'long'];

const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1));

/** Clean y-axis ticks: 0 and steps of 1, 2, 5, 10, … up to the top. */
function ticks(max: number): number[] {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  // The last tick sits at or above the maximum, so no line runs off the top.
  for (let v = 0; out.length < 2 || out[out.length - 1] < max - 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/** The bracket most of a range's expected damage is fired at (shades the plot behind it). */
function mainBracket(p: RangePoint): Bracket | null {
  const by: Record<Bracket, number> = { short: 0, medium: 0, long: 0 };
  for (const w of p.weapons) by[w.bracket] += w.expected;
  const best = BRACKETS.reduce((a, b) => (by[b] > by[a] ? b : a));
  return by[best] > 0 ? best : null;
}

/** Expected and best-case damage of the forward weapons at every range, with an optional heat-neutral limit. */
export function DamageChart({ design, summary }: Props) {
  const [heatNeutral, setHeatNeutral] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const budget = summary.heatSinks.dissipation;
  const data = useMemo(() => damageByRange(design, budget, heatNeutral), [design, budget, heatNeutral]);
  const pts = data.points;

  const header = (
    <div className="dmg-head">
      <h3>Damage by range</h3>
      <label className="check small" title="Fire only the weapons the heat sinks can cool each turn, picked for the most damage">
        <input type="checkbox" checked={heatNeutral} onChange={(e) => setHeatNeutral(e.target.checked)} />
        Heat-neutral ({budget} heat/turn)
      </label>
    </div>
  );
  if (!pts.length) {
    return (
      <div className="dmg-chart">
        {header}
        <p className="muted small">No forward-firing weapons that deal damage.</p>
      </div>
    );
  }

  const maxHex = pts.length;
  const top = ticks(Math.max(...pts.map((p) => p.ideal), 1));
  const yMax = top[top.length - 1];
  const x = (hex: number) => M.left + ((hex - 1) / Math.max(1, maxHex - 1)) * PW;
  const y = (v: number) => M.top + PH - (v / yMax) * PH;
  const colW = PW / Math.max(1, maxHex - 1);
  const line = (k: 'expected' | 'ideal') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.hex).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
  const area = `${line('expected')}L${x(maxHex).toFixed(1)},${y(0)}L${x(1).toFixed(1)},${y(0)}Z`;
  const xStep = maxHex > 24 ? 5 : maxHex > 12 ? 3 : 1;
  const xTicks = [1, ...Array.from({ length: Math.floor(maxHex / xStep) }, (_, i) => (i + 1) * xStep).filter((h) => h > 1 && h <= maxHex)];
  const best = pts.reduce((a, b) => (b.expected > a.expected ? b : a));
  const hp = hover !== null ? pts[hover - 1] : null;

  const onMove = (e: React.PointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const hex = Math.round(((px - M.left) / PW) * (maxHex - 1)) + 1;
    setHover(Math.max(1, Math.min(maxHex, hex)));
  };

  return (
    <div className="dmg-chart">
      {header}
      <p className="small dmg-best">
        Most expected damage: <strong>{fmt(best.expected)}</strong> at {best.hex} hex{best.hex > 1 ? 'es' : ''}
        {heatNeutral && best.heldBack > 0 && <span className="muted"> ({best.heldBack} weapon{best.heldBack > 1 ? 's' : ''} held back)</span>}
      </p>
      <div className="dmg-legend small">
        <span><svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" className="dmg-line" /></svg> Expected</span>
        <span><svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" className="dmg-line ideal" /></svg> If every shot hits</span>
        <span className="dmg-bands" title="The range bracket most of the expected damage is fired at">
          {BRACKETS.map((b) => <span key={b}><i className={`dmg-swatch band-${b}`} />{b}</span>)}
        </span>
      </div>
      <div className="dmg-plot" onPointerLeave={() => setHover(null)}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" onPointerMove={onMove} onPointerDown={onMove}
          aria-label={`Expected damage by range: most ${fmt(best.expected)} at ${best.hex} hexes; ${fmt(best.ideal)} if every shot hits there.`}>
          {pts.map((p) => {
            const b = mainBracket(p);
            return b && <rect key={p.hex} className={`band-${b}`} x={Math.max(M.left, x(p.hex) - colW / 2)} y={M.top}
              width={Math.min(x(p.hex) + colW / 2, M.left + PW) - Math.max(M.left, x(p.hex) - colW / 2)} height={PH} />;
          })}
          {top.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'dmg-axis' : 'dmg-grid'} x1={M.left} x2={M.left + PW} y1={y(t)} y2={y(t)} />
              <text className="dmg-tick" x={M.left - 5} y={y(t)} dy="0.32em" textAnchor="end">{t}</text>
            </g>
          ))}
          {xTicks.map((h) => (
            <text key={h} className="dmg-tick" x={x(h)} y={M.top + PH + 14} textAnchor="middle">{h}</text>
          ))}
          <text className="dmg-tick" x={M.left + PW} y={H - 1} textAnchor="end">hexes</text>
          <path d={area} className="dmg-area" />
          <path d={line('ideal')} className="dmg-line ideal" />
          <path d={line('expected')} className="dmg-line" />
          {hp && (
            <g>
              <line className="dmg-cross" x1={x(hp.hex)} x2={x(hp.hex)} y1={M.top} y2={M.top + PH} />
              <circle className="dmg-dot" cx={x(hp.hex)} cy={y(hp.expected)} r={4} />
            </g>
          )}
        </svg>
        {hp && (
          <div className="dmg-tip small" style={{
            left: `${(x(hp.hex) / W) * 100}%`,
            transform: hp.hex > (maxHex + 1) / 2 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
          }}>
            <div><strong>{hp.hex} hex{hp.hex > 1 ? 'es' : ''}</strong></div>
            <div>Expected <strong>{fmt(hp.expected)}</strong> · if all hit {fmt(hp.ideal)}</div>
            <div className="muted">Heat {hp.heat}{heatNeutral && hp.heldBack ? ` · ${hp.heldBack} held back` : ''}</div>
            {hp.weapons.slice(0, 6).map((w) => (
              <div key={w.uid} className="dmg-tip-row"><span>{w.name}</span><span>{fmt(w.expected)}</span></div>
            ))}
            {hp.weapons.length > 6 && <div className="muted">+{hp.weapons.length - 6} more</div>}
          </div>
        )}
      </div>
      <details className="dmg-details small">
        <summary>Table and assumptions</summary>
        <p className="muted">
          Gunnery {BASE_TO_HIT}, no movement or terrain modifiers; +0 / +2 / +4 at short / medium / long range and +1 per hex
          inside minimum range; pulse lasers −2, a targeting computer −1. Missiles, cluster weapons and Ultra / Rotary autocannon
          (at full rate) land the average of the Cluster Hits Table; Streaks hit with every missile; LB-X fire slugs.
          {heatNeutral && ` Heat-neutral: the weapons fired at each range are the best set within ${budget} heat.`}
          {data.omitted.length > 0 && ` Not counted (rear-facing, unallocated or no direct damage): ${[...new Set(data.omitted)].join(', ')}.`}
        </p>
        <div className="table-scroll">
          <table className="dmg-table">
            <thead><tr><th>Hexes</th><th>Expected</th><th>All hit</th><th>Heat</th></tr></thead>
            <tbody>
              {pts.map((p) => (
                <tr key={p.hex}><td className="num">{p.hex}</td><td className="num">{fmt(p.expected)}</td><td className="num">{fmt(p.ideal)}</td><td className="num">{p.heat}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
