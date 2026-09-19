import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import './app.css';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/lib/auth';
import { AdminGuard } from '@/features/admin/AdminGuard';
import { AdminHome } from '@/features/admin/AdminHome';
import { ReviewLayout } from '@/features/admin/ReviewLayout';
import { ReviewListTab } from '@/features/admin/ReviewListTab';
import { CheckUpdatesTab } from '@/features/admin/CheckUpdatesTab';
import { ContentManagementTab } from '@/features/admin/ContentManagementTab';

function AdminApp() {
  return (
    <AdminGuard>
      <Routes>
        <Route path="/" element={<AdminHome />} />
        <Route path="/review/:tab" element={<ReviewLayout />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminGuard>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          {/* Display routes land in Phase 3/4 — admin Phase 2 ships first. */}
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
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
