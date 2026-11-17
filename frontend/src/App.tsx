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
import { RequirePermission } from '@/components/RequirePermission';

const POSPage = lazy(() => import('@/pages/POSPage').then((m) => ({ default: m.POSPage })));
const MenuPage = lazy(() => import('@/pages/MenuPage').then((m) => ({ default: m.MenuPage })));
const InventoryPage = lazy(() => import('@/pages/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const ConsumptionPage = lazy(() => import('@/pages/ConsumptionPage').then((m) => ({ default: m.ConsumptionPage })));
const EmployeesPage = lazy(() => import('@/pages/EmployeesPage').then((m) => ({ default: m.EmployeesPage })));
const PermissionsPage = lazy(() => import('@/pages/PermissionsPage').then((m) => ({ default: m.PermissionsPage })));
const VoidsPage = lazy(() => import('@/pages/VoidsPage').then((m) => ({ default: m.VoidsPage })));
const ReceiptDesignPage = lazy(() => import('@/pages/ReceiptDesignPage').then((m) => ({ default: m.ReceiptDesignPage })));
const CashClosingPage = lazy(() => import('@/pages/CashClosingPage').then((m) => ({ default: m.CashClosingPage })));
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
                <Route index element={<RequirePermission path="/"><Suspense fallback={<PageSpinner />}><POSPage /></Suspense></RequirePermission>} />
                <Route path="menu" element={<RequirePermission path="/menu"><Suspense fallback={<PageSpinner />}><MenuPage /></Suspense></RequirePermission>} />
                <Route path="inventory" element={<RequirePermission path="/inventory"><Suspense fallback={<PageSpinner />}><InventoryPage /></Suspense></RequirePermission>} />
                <Route path="reports" element={<RequirePermission path="/reports"><Suspense fallback={<PageSpinner />}><ReportsPage /></Suspense></RequirePermission>} />
                <Route path="consumptions" element={<RequirePermission path="/consumptions"><Suspense fallback={<PageSpinner />}><ConsumptionPage /></Suspense></RequirePermission>} />
                <Route path="voids" element={<RequirePermission path="/voids"><Suspense fallback={<PageSpinner />}><VoidsPage /></Suspense></RequirePermission>} />
                <Route path="receipt-design" element={<RequirePermission path="/receipt-design"><Suspense fallback={<PageSpinner />}><ReceiptDesignPage /></Suspense></RequirePermission>} />
                <Route path="cash-closing" element={<RequirePermission path="/cash-closing"><Suspense fallback={<PageSpinner />}><CashClosingPage /></Suspense></RequirePermission>} />
                <Route path="employees" element={<RequirePermission path="/employees"><Suspense fallback={<PageSpinner />}><EmployeesPage /></Suspense></RequirePermission>} />
                <Route path="permissions" element={<RequirePermission path="/permissions"><Suspense fallback={<PageSpinner />}><PermissionsPage /></Suspense></RequirePermission>} />
                <Route path="*" element={<Suspense fallback={<PageSpinner />}><NotFoundPage /></Suspense>} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </Toaster>
      </AuthProvider>
    </ThemeProvider>
  );
}
