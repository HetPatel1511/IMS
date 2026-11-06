import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { AuthProvider } from '../shared/auth';
import { ToastProvider, emitToast } from '../shared/toast';
import { toErrorMessage } from '../shared/api';
import { ConfirmProvider } from '../shared/confirm';
import { BreadcrumbProvider } from '../shared/breadcrumb';
import '../shared/theme';
import { AppLayout } from './AppLayout';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { InventoryTypesPage } from '../features/inventory-types/InventoryTypesPage';
import { TypeSchemaPage } from '../features/inventory-types/TypeSchemaPage';
import { ItemsPage } from '../features/inventory-items/ItemsPage';
import { BuyersPage, SuppliersPage } from '../features/parties/PartiesPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AuditPage } from '../features/audit/AuditPage';
import { StockPage } from '../features/stock/StockPage';

let lastQueryErrorAt = 0;
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // Dedupe bursts of query failures into a single toast.
      const now = Date.now();
      if (now - lastQueryErrorAt < 1500) return;
      lastQueryErrorAt = now;
      emitToast('error', toErrorMessage(error));
    },
  }),
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <ConfirmProvider>
      <AuthProvider>
        <BrowserRouter>
          <BreadcrumbProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="inventory-types" element={<InventoryTypesPage />} />
              <Route path="inventory-types/:typeId" element={<TypeSchemaPage />} />
              <Route path="items" element={<ItemsPage />} />
              <Route path="stock" element={<StockPage />} />
              <Route path="suppliers" element={<SuppliersPage />} />
              <Route path="buyers" element={<BuyersPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="audit" element={<AuditPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </BreadcrumbProvider>
        </BrowserRouter>
      </AuthProvider>
      </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
