import { Routes, Route } from 'react-router';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { POSPage } from '@/pages/POSPage';
import { MenuPage } from '@/pages/MenuPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { RecipePage } from '@/pages/RecipePage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ConsumptionPage } from '@/pages/ConsumptionPage';
import { EmployeesPage } from '@/pages/EmployeesPage';

export default function App() {
  return (
    <AuthProvider>
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
          <Route index element={<POSPage />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="recipes" element={<RecipePage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="consumptions" element={<ConsumptionPage />} />
          <Route path="employees" element={<EmployeesPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
