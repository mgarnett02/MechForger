import type { MechDesign } from '../rules/types';
import type { MechSummary } from '../rules/construction';
import {
  addConfiguration, configurationDesigns, deleteConfiguration, renameConfiguration, switchConfiguration,
} from '../rules/omni';
import { validate } from '../rules/validation';

interface Props {
  design: MechDesign;
  summary: MechSummary;
  update: (fn: (d: MechDesign) => MechDesign) => void;
}

const t = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** OmniMech configuration tabs plus pod-space usage. */
export function OmniBar({ design, summary, update }: Props) {
  const omni = design.omni;
  if (!omni || !summary.omni) return null;
  const { podSpace, podUsed, fixed } = summary.omni;
  const active = omni.configurations[omni.active];
  // Flag configurations that are not legal so problems off-screen are visible.
  const broken = new Set(
    configurationDesigns(design)
      .filter((c) => validate(c.design).some((i) => i.severity === 'error'))
      .map((c) => c.name),
  );

  return (
    <div className="omni-bar">
      <div className="row wrap">
        <strong>Configuration</strong>
        <div className="tabs" role="tablist" aria-label="OmniMech configurations">
          {omni.configurations.map((c, i) => (
            <button key={`${c.name}-${i}`} role="tab" aria-selected={i === omni.active}
              className={`${i === omni.active ? 'active' : ''} ${broken.has(c.name) ? 'broken' : ''}`}
              title={broken.has(c.name) ? 'This configuration has errors' : undefined}
              onClick={() => update((d) => switchConfiguration(d, i))}>
              {c.name}{broken.has(c.name) ? ' ⚠' : ''}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="small" onClick={() => update((d) => addConfiguration(d, false))}>New</button>
        <button className="small" onClick={() => update((d) => addConfiguration(d, true))}>Copy</button>
        <button className="small" onClick={() => {
          const name = window.prompt('Rename configuration', active.name);
          if (name) update((d) => renameConfiguration(d, omni.active, name));
        }}>Rename</button>
        <button className="small danger" disabled={omni.configurations.length < 2}
          onClick={() => {
            if (window.confirm(`Delete configuration ${active.name}?`)) {
              update((d) => deleteConfiguration(d, omni.active));
            }
          }}>Delete</button>
      </div>
      <div className={`pod-meter ${podUsed > podSpace ? 'over' : ''}`}>
        <div style={{ width: `${podSpace > 0 ? Math.min(100, (podUsed / podSpace) * 100) : 0}%` }} />
      </div>
      <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
        Base chassis {t(fixed)} t · pod space {t(podSpace)} t · {active.name} uses {t(podUsed)} t
      </p>
    </div>
  );
}
