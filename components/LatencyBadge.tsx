import type { ModelId } from '@/types';

interface LatencyBadgeProps {
  model: ModelId;
}

export default function LatencyBadge({ model }: LatencyBadgeProps) {
  const latency = model === 'max' ? '~200ms' : '~100ms';
  const color = model === 'max' ? '#7C3AED' : '#10B981';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      backgroundColor: `${color}18`, color, letterSpacing: '0.02em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color }} />
      {latency} TTFA
    </span>
  );
}
