import type { JobStatus } from '../types';
import { statusLabel } from '../data/selectors';

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={'badge dot badge-' + status}>{statusLabel(status)}</span>;
}
