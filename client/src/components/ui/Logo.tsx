import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import logoUrl from '@/assets/logo.png';

/**
 * Logo lockup, top-left on every page (brief). The current logo asset is an
 * ultra-wide horizontal lockup (10280×2089 ≈ 4.92:1) — sized by height with
 * auto width so the aspect ratio is never distorted (client issue #1).
 * Display pages → `/`; admin pages → `/admin` (logo link target per copy deck).
 *
 * The asset is imported (not a /public URL) so the single-file export build
 * inlines it as a data URL and the logo renders offline.
 */
export function Logo({ to = '/', className }: { to?: '/' | '/admin'; className?: string }) {
  return (
    <Link
      to={to}
      aria-label="DKU Leadership Resource Bank"
      className={cn(
        'inline-flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2',
        className,
      )}
      style={{ outlineColor: 'var(--focus)' }}
    >
      <img
        src={logoUrl}
        alt=""
        className="block h-9 w-auto max-w-[280px] object-contain"
        width={176}
        height={36}
      />
    </Link>
  );
}
