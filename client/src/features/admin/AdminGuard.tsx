import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/ui/Logo';

/**
 * AdminGuard — `/admin/*` unauthenticated renders the login card centered
 * (no page redirect; URL preserved). Copy deck verbatim (03-pages §Login):
 * `Admin sign-in` / password input / `Sign in` / `Wrong password. Try again.`
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state === 'unknown') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-ink-soft text-[14px]" aria-hidden>…</span>
      </div>
    );
  }
  if (state === 'signed-out') return <LoginCard />;
  return <>{children}</>;
}

function LoginCard() {
  const { signIn } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn(password);
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Wrong password. Try again.');
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="absolute left-6 top-6">
        <Logo to="/admin" />
      </div>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-mist bg-surface p-8 shadow-[0_16px_48px_rgba(26,43,42,0.08)]"
        aria-labelledby="login-title"
      >
        <h1 id="login-title" className="font-display text-[24px] font-semibold text-ink">
          Admin sign-in
        </h1>
        <label className="mt-6 block text-[14px] font-medium text-ink" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          className="mt-2 w-full rounded-lg border border-mist bg-surface px-3 py-2.5 text-[16px] text-ink placeholder:text-ink-soft/60 focus-visible:outline-2"
          style={{ outlineColor: 'var(--focus)' }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? (
          <p role="alert" className="mt-3 text-[14px]" style={{ color: '#8A3B3B' }}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="mt-6 w-full rounded-lg px-4 py-2.5 text-[15px] font-semibold text-white transition-transform duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          style={{ background: 'var(--ramp-mid)' }}
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
