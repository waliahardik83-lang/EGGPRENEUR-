import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getPendingCount, flushQueue } from '../lib/offlineQueue';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/budget', label: 'Budget' },
  { to: '/locations', label: 'Locations' },
  { to: '/menu', label: 'Menu & Costing' },
  { to: '/finance', label: 'Break-even' },
  { to: '/actions', label: 'Actions' },
  { to: '/decisions', label: 'Decisions' },
  { to: '/assistant', label: 'AI Consultant' },
  { to: '/settings', label: 'Settings' }
];

export function Layout() {
  const { signOut, user } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(getPendingCount());

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const interval = setInterval(() => setPending(getPendingCount()), 3000);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      clearInterval(interval);
    };
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      <header style={{ background: '#b4530a', color: 'white', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <strong>Eggpreneur — Ambala</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.8rem' }}>
          <span title={online ? 'Online' : 'Offline — writes are queued locally'}>
            {online ? '● Online' : '○ Offline'}
            {pending > 0 && ` (${pending} queued)`}
          </span>
          {pending > 0 && online && (
            <button onClick={() => void flushQueue().then(() => setPending(getPendingCount()))} style={{ fontSize: '0.75rem' }}>
              Sync now
            </button>
          )}
          <span>{user?.email}</span>
          <button onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>
      <nav style={{ display: 'flex', gap: 4, padding: '8px 12px', background: '#fff7ed', overflowX: 'auto', borderBottom: '1px solid #fde4c0' }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive }) => ({
              padding: '6px 10px',
              borderRadius: 6,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              fontSize: '0.85rem',
              color: isActive ? 'white' : '#7c2d12',
              background: isActive ? '#b4530a' : 'transparent'
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main style={{ flex: 1, padding: 16, maxWidth: 960, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </main>
    </div>
  );
}
