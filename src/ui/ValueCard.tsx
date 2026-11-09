import type { BVBreakdown, CostBreakdown } from '../rules/battleValue';

const num = (n: number) => (Math.abs(n) < 10 && !Number.isInteger(n) ? n.toFixed(2) : Math.round(n).toLocaleString('en-US'));

/** Battle Value and C-bill cost with an expandable breakdown. */
export function ValueCard({ bv, cost }: { bv: BVBreakdown; cost: CostBreakdown }) {
  const approx = bv.approximate || cost.approximate;
  return (
    <div className="value-card">
      <div className="value-row">
        <div>
          <span className="muted small">Battle Value{approx ? ' (approx.)' : ''}</span>
          <strong className="value-big">{approx ? '≈ ' : ''}{bv.total.toLocaleString('en-US')}</strong>
        </div>
        <div>
          <span className="muted small">Cost{approx ? ' (approx.)' : ''}</span>
          <strong className="value-big">{approx ? '≈ ' : ''}{cost.total.toLocaleString('en-US')} <span className="small">C-bills</span></strong>
        </div>
      </div>
      <details>
        <summary className="small">Show the working</summary>
        <div className="value-detail">
          <table className="weights">
            <caption className="small muted">BV 2.0 — defensive {num(bv.defensive)} + offensive {num(bv.offensive)}</caption>
            <tbody>{bv.lines.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{num(v)}</td></tr>)}</tbody>
          </table>
          <table className="weights">
            <caption className="small muted">C-bill cost</caption>
            <tbody>{cost.lines.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{num(v)}</td></tr>)}</tbody>
          </table>
          {approx && (
            <p className="small muted">
              Vehicle BV and cost follow the TechManual structure but some vehicle modifiers are
              from memory; treat them as estimates.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
