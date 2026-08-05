import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/Layout';
import { Toaster } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PageSpinner } from '@/components/PageSpinner';
import { LoginPage } from '@/pages/LoginPage';

const POSPage = lazy(() => import('@/pages/POSPage').then((m) => ({ default: m.POSPage })));
const MenuPage = lazy(() => import('@/pages/MenuPage').then((m) => ({ default: m.MenuPage })));
const InventoryPage = lazy(() => import('@/pages/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const ConsumptionPage = lazy(() => import('@/pages/ConsumptionPage').then((m) => ({ default: m.ConsumptionPage })));
const EmployeesPage = lazy(() => import('@/pages/EmployeesPage').then((m) => ({ default: m.EmployeesPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Toaster>
          <ErrorBoundary>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Suspense fallback={<PageSpinner />}><POSPage /></Suspense>} />
                <Route path="menu" element={<Suspense fallback={<PageSpinner />}><MenuPage /></Suspense>} />
                <Route path="inventory" element={<Suspense fallback={<PageSpinner />}><InventoryPage /></Suspense>} />
                <Route path="reports" element={<Suspense fallback={<PageSpinner />}><ReportsPage /></Suspense>} />
                <Route path="consumptions" element={<Suspense fallback={<PageSpinner />}><ConsumptionPage /></Suspense>} />
                <Route path="employees" element={<Suspense fallback={<PageSpinner />}><EmployeesPage /></Suspense>} />
                <Route path="*" element={<Suspense fallback={<PageSpinner />}><NotFoundPage /></Suspense>} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </Toaster>
      </AuthProvider>
    </ThemeProvider>
  );
}
