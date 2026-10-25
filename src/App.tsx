import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { CapitalBudget } from './pages/CapitalBudget';
import { Locations } from './pages/Locations';
import { LocationDetail } from './pages/LocationDetail';
import { MenuCosting } from './pages/MenuCosting';
import { BreakEvenCalculator } from './pages/BreakEvenCalculator';
import { ActionRegister } from './pages/ActionRegister';
import { Conversations } from './pages/Conversations';
import { Decisions } from './pages/Decisions';
import { Settings } from './pages/Settings';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p style={{ padding: 20 }}>Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/budget" element={<CapitalBudget />} />
            <Route path="/locations" element={<Locations />} />
            <Route path="/locations/:id" element={<LocationDetail />} />
            <Route path="/menu" element={<MenuCosting />} />
            <Route path="/finance" element={<BreakEvenCalculator />} />
            <Route path="/actions" element={<ActionRegister />} />
            <Route path="/decisions" element={<Decisions />} />
            <Route path="/assistant" element={<Conversations />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
