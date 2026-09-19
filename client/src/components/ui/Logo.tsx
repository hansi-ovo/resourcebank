import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * Logo lockup, top-left on every page (brief).
 * Display pages → `/`; admin pages → `/admin` (logo link target per 03-pages §Copy deck).
 */
export function Logo({ to = '/', className }: { to?: '/' | '/admin'; className?: string }) {
  return (
    <Link
      to={to}
      aria-label="DKU Leadership Resource Bank"
      className={cn(
        'inline-flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2',
        className,
      )}
      style={{ outlineColor: 'var(--focus)' }}
    >
      <img src="/logo.png" alt="" width={40} height={40} className="block h-10 w-10" />
    </Link>
  );
}
