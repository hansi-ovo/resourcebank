import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import './app.css';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/lib/auth';
import { AdminGuard } from '@/features/admin/AdminGuard';
import { AdminHome } from '@/features/admin/AdminHome';
import { ReviewLayout } from '@/features/admin/ReviewLayout';
import { HeroPage } from '@/features/display/HeroPage';
import { ContentPage } from '@/features/display/ContentPage';
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
          {/* Display */}
          <Route path="/" element={<HeroPage />} />
          <Route path="/resources" element={<ContentPage />} />
          {/* Admin (no display→admin links; admins navigate by URL — D13) */}
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
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
