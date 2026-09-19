import { Link } from 'react-router';
import { Logo } from '@/components/ui/Logo';

/** Quiet tonal 404 (Phase 5). */
export function NotFound() {
  return (
    <div className="nf-root">
      <header className="nf-header">
        <Logo />
      </header>
      <main className="nf-main">
        <h1 className="nf-title">Page not found</h1>
        <p className="nf-copy">
          The page you are looking for is not here.{' '}
          <Link to="/" className="nf-link">
            Back to the Resource Bank
          </Link>
        </p>
      </main>
    </div>
  );
}
