import FuseButton from '@/components/react-bits/FuseButton';
import { useReducedMotion } from '@/lib/motion';

/**
 * App wrapper around the vendored react-bits FuseButton.
 * Frozen params (D12): undoWindow 7000, fuse outline, commitOn press, settle reset.
 * Colors come from design tokens; reduced-motion = instant states + no fuse burn
 * (crossfadeMs 0 + CSS hides the burning rim/line — wrapper-level fix, vendor untouched).
 */
export function FuseAction({
  label,
  undoLabel,
  onCommit,
  onUndo,
  variant = 'primary',
  size = 'sm',
}: {
  label: string;
  undoLabel: string;
  onCommit: () => void;
  onUndo: () => void;
  variant?: 'primary' | 'danger' | 'neutral';
  size?: 'sm' | 'md';
}) {
  const reduced = useReducedMotion();

  const theme = {
    primary: { ink: '#FFFFFF', bg: 'var(--cat-on-campus)', fuse: 'color-mix(in oklab, var(--cat-on-campus) 55%, #ffffff)' },
    danger: { ink: '#8A3B3B', bg: 'color-mix(in oklab, #8A3B3B 8%, white)', fuse: '#8A3B3B' },
    neutral: { ink: '#FFFFFF', bg: 'var(--ramp-mid)', fuse: 'color-mix(in oklab, var(--ramp-mid) 55%, #ffffff)' },
  }[variant];

  return (
    <span className={reduced ? 'fuse-quiet' : undefined}>
      <FuseButton
        label={label}
        undoLabel={undoLabel}
        undoWindow={7000}
        fuse="outline"
        fuseThickness={1.5}
        commitOn="press"
        settle="reset"
        crossfadeMs={reduced ? 0 : 200}
        color={theme.ink}
        background={theme.bg}
        fuseColor={theme.fuse}
        size={size}
        radius={18}
        onCommit={onCommit}
        onUndo={onUndo}
      />
    </span>
  );
}
