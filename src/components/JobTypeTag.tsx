import { getJobType } from '../data/selectors';

interface JobTypeTagProps {
  type: string;
  size?: 'sm' | 'lg';
}

export function JobTypeTag({ type, size }: JobTypeTagProps) {
  const jt = getJobType(type);
  if (!jt) return null;
  return <span className={'jt-tag ' + jt.color + (size === 'lg' ? ' lg' : '')}>{jt.short}</span>;
}
