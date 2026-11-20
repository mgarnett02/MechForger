import { useState } from 'react';
import type { MechDesign } from '../rules/types';
import type { MechSummary } from '../rules/construction';
import type { Issue } from '../rules/validation';
import { technicalReadout } from '../rules/readout';
import { mechBV, mechCost } from '../rules/battleValue';
import { ValueCard } from './ValueCard';
import { DamageChart } from './DamageChart';

interface Props {
  design: MechDesign;
  summary: MechSummary;
  issues: Issue[];
}

const t = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function SummaryPanel({ design, summary, issues }: Props) {
  const [copied, setCopied] = useState(false);
  const w = summary.weights;
  const rows: [string, number][] = [
    ['Internal structure', w.structure],
    ['Engine', w.engine],
    ['Gyro', w.gyro],
    ['Cockpit', w.cockpit],
    ['Heat sinks', w.heatSinks],
    ['Jump jets', w.jumpJets],
    ['Armor', w.armor],
    ['Weapons & ammo', w.equipment],
    ...(w.armored ? [['Armored components', w.armored] as [string, number]] : []),
    ...(w.conversion ? [['LAM conversion', w.conversion] as [string, number]] : []),
  ];
  const pct = Math.min(100, (w.total / design.tonnage) * 100);
  const errors = issues.filter((i) => i.severity === 'error');
  const readout = technicalReadout(design, summary);

  return (
    <section className="panel">
      <h2>Summary</h2>
      <div className={`weight-bar ${w.free < 0 ? 'over' : ''}`} aria-label="Tonnage used">
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="weight-line">
        <strong>{t(w.total)}</strong> / {design.tonnage} tons{' '}
        <span className={w.free < 0 ? 'bad' : 'muted'}>
          ({w.free < 0 ? `${t(-w.free)} over` : `${t(w.free)} free`})
        </span>
      </p>
      <table className="weights">
        <tbody>
          {rows.map(([label, v]) => (
            <tr key={label}><td>{label}</td><td className="num">{t(v)}</td></tr>
          ))}
        </tbody>
      </table>

      <div className="stats">
        <div><span className="muted small">Move</span><strong>{design.walkMP}/{summary.runMP}/{summary.totalJumpMP}</strong></div>
        <div><span className="muted small">Heat sinks</span><strong>{summary.heatSinks.total}</strong></div>
        <div><span className="muted small">Weapon heat</span><strong>{summary.heat.weapons}</strong></div>
        <div><span className="muted small">Armor</span><strong>{summary.armorTotal}/{summary.armorMaxTotal}</strong></div>
      </div>
      <ValueCard bv={mechBV(design)} cost={mechCost(design)} />
      <DamageChart design={design} summary={summary} />

      <h3 id="validation">
        Validation{' '}
        {errors.length === 0
          ? <span className="ok small">✓ legal design</span>
          : <span className="bad small">{errors.length} error{errors.length > 1 ? 's' : ''}</span>}
      </h3>
      <ul className="issues">
        {issues.map((i, n) => (
          <li key={n} className={i.severity}>{i.message}</li>
        ))}
      </ul>

      <h3>
        Technical readout{' '}
        <button className="small" onClick={() => {
          navigator.clipboard?.writeText(readout).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }, () => {});
        }}>{copied ? 'Copied' : 'Copy'}</button>
      </h3>
      <pre className="readout">{readout}</pre>
    </section>
  );
}
