import type { EvidenceConfidence } from '../types/database';

const STYLES: Record<EvidenceConfidence, { bg: string; fg: string; label: string }> = {
  VERIFIED: { bg: '#dcfce7', fg: '#166534', label: 'VERIFIED' },
  USER_REPORTED: { bg: '#dbeafe', fg: '#1e40af', label: 'USER-REPORTED' },
  ESTIMATED: { bg: '#fef3c7', fg: '#92400e', label: 'ESTIMATED' },
  UNVERIFIED: { bg: '#fee2e2', fg: '#991b1b', label: 'UNVERIFIED' }
};

export function EvidenceBadge({ confidence }: { confidence: EvidenceConfidence }) {
  const s = STYLES[confidence];
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        fontSize: '0.7rem',
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 999,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap'
      }}
    >
      {s.label}
    </span>
  );
}
