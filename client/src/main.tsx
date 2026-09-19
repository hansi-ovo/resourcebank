import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import './app.css';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/lib/auth';
import { HeroPage } from '@/features/display/HeroPage';
import { NotFound } from '@/features/display/NotFound';

// display content page is a separate route chunk (gsap/ScrollTrigger/modal
// code only loads on /resources; hero stays eager — it IS the landing page)
const ContentPage = lazy(() =>
  import('@/features/display/ContentPage').then((m) => ({ default: m.ContentPage })),
);

// admin is never linked from the display app (D13) — only admins hit /admin,
// so it loads on demand and stays out of the display bundle budget.
const AdminApp = lazy(() =>
  import('@/features/admin/AdminApp').then((m) => ({ default: m.AdminApp })),
);

function Loading({ label }: { label: string }) {
  return (
    <div className="admin-loading" role="status" aria-label={label}>
      …
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          {/* Display */}
          <Route path="/" element={<HeroPage />} />
          <Route
            path="/resources"
            element={
              <Suspense fallback={<Loading label="Loading" />}>
                <ContentPage />
              </Suspense>
            }
          />
          {/* Admin (no display→admin links; admins navigate by URL — D13) */}
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<Loading label="Loading admin" />}>
                <AdminApp />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
