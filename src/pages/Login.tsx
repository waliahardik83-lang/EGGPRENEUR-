import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';

export function Login() {
  const { signInWithPassword, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const result = mode === 'signin' ? await signInWithPassword(email, password) : await signUp(email, password, fullName);
    setBusy(false);
    if (result.error) {
      setError(result.error);
    } else if (mode === 'signup') {
      setInfo('Account created. Check your email to confirm (if email confirmation is enabled on your Supabase project), then sign in.');
    }
  };

  return (
    <div style={{ maxWidth: 380, margin: '60px auto', padding: 20, border: '1px solid #eee', borderRadius: 12 }}>
      <h1 style={{ fontSize: '1.3rem' }}>Eggpreneur</h1>
      <p style={{ color: '#666', fontSize: '0.9rem' }}>Ambala restaurant business command center — private, family sign-in only.</p>
      <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {mode === 'signup' && (
          <input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        )}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password (min 6 characters)" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
      </form>
      {error && <p style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{error}</p>}
      {info && <p style={{ color: '#166534', fontSize: '0.85rem' }}>{info}</p>}
      <button
        style={{ marginTop: 12, background: 'none', border: 'none', color: '#b4530a', cursor: 'pointer', fontSize: '0.85rem' }}
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
      >
        {mode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
