import type { Issue } from '../rules/validation';
import { designStatus } from '../rules/validation';

interface Props {
  issues: Issue[];
}

const LAMPS = ['illegal', 'warnings', 'legal'] as const;

/** Red / amber / green traffic light showing whether the design is legal. */
export function StatusLight({ issues }: Props) {
  const status = designStatus(issues);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const label =
    status === 'illegal' ? 'Illegal' : status === 'warnings' ? 'Legal, incomplete' : 'Legal';
  const detail =
    status === 'illegal'
      ? plural(errors.length, 'error') + (warnings.length ? `, ${plural(warnings.length, 'warning')}` : '')
      : status === 'warnings'
        ? plural(warnings.length, 'warning')
        : 'ready to play';
  const shown = status === 'illegal' ? errors : warnings;
  const tooltip = shown.length
    ? shown.slice(0, 8).map((i) => `• ${i.message}`).join('\n') + (shown.length > 8 ? `\n…and ${shown.length - 8} more` : '')
    : 'No problems found.';

  return (
    <button
      className={`status-light ${status}`}
      title={`${tooltip}\n\nClick to see all validation messages.`}
      aria-label={`Design status: ${label}, ${detail}. Show validation messages.`}
      onClick={() => document.getElementById('validation')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
    >
      <span className="lamps" aria-hidden="true">
        {LAMPS.map((l) => (
          <span key={l} className={`lamp lamp-${l} ${l === status ? 'on' : ''}`} />
        ))}
      </span>
      <span className="status-text" aria-live="polite">
        <strong>{label}</strong>
        <span className="small">{detail}</span>
      </span>
    </button>
  );
}
