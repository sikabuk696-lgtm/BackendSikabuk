import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from '../../utils/notify';
import SikaBukLogo from '../../components/SikaBukLogo';
import OwnerPinModal from '../../components/OwnerPinModal';
import './AuthRedesign.css';

export default function LoginPage() {
  const [mode, setMode] = useState('owner'); // 'owner' | 'worker'
  const navigate = useNavigate();
  const { login } = useAuth();

  return (
    <div className="auth-page">
      <AuthBrand />
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-mobile-logo">
            <div className="brand-logo-icon"><SikaBukLogo size={38} /></div>
            <div className="brand-name">₵ikaBuk</div>
          </div>

          <h2>Akwaaba! 👋</h2>
          <p className="auth-subtitle">Sign in to manage your business</p>

          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'owner' ? 'active' : ''}`}
              onClick={() => setMode('owner')}
            >
              Owner Login
            </button>
            <button
              className={`auth-tab ${mode === 'worker' ? 'active' : ''}`}
              onClick={() => setMode('worker')}
            >
              Worker Login
            </button>
          </div>

          {mode === 'owner' ? (
            <OwnerLogin login={login} navigate={navigate} />
          ) : (
            <WorkerLogin login={login} navigate={navigate} />
          )}

          <div className="auth-link">
            New business? <Link to="/register">Create account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Owner Google Login (Supabase OAuth) ───────── */
function OwnerLogin({ login, navigate }) {
  const [loading, setLoading] = useState(false);
  // PIN gate state — set after supabaseAuth returns a tempToken
  const [pinStep,   setPinStep]   = useState(null);  // null | 'setup' | 'verify'
  const [tempToken, setTempToken] = useState(null);
  const [bizData,   setBizData]   = useState(null);

  useEffect(() => {
    // Parse OAuth redirect tokens from URL (hash or query). Fall back to getSession().
    const handleOAuthCallback = async () => {
      try {
        const raw = window.location.hash || window.location.search || '';
        let accessFromUrl = null;
        if (raw) {
          const params = new URLSearchParams(raw.replace(/^#|^\?/, ''));
          accessFromUrl = params.get('access_token') || params.get('accessToken');
        }

        let sessionAccess = null;
        if (accessFromUrl) {
          sessionAccess = accessFromUrl;
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } else {
          const res = await supabase.auth.getSession();
          sessionAccess = res?.data?.session?.access_token || null;
        }

        if (!sessionAccess) return;

        setLoading(true);
        try {
          const { data } = await authAPI.supabaseAuth({ accessToken: sessionAccess });

          // ── Check if this is an unrecognised new user ──
          if (data.data.isNewBusiness === true && !data.data.tempToken) {
            toast.error('No account found. Please create an account first.', { duration: 4000 });
            await supabase.auth.signOut();
            setTimeout(() => navigate('/register'), 1500);
            return;
          }

          // ── PIN gate: backend always returns tempToken + pinStatus ──
          if (data.data.tempToken && data.data.pinStatus) {
            setTempToken(data.data.tempToken);
            setBizData({ business: data.data.business, worker: data.data.worker, isNewBusiness: data.data.isNewBusiness });
            setPinStep(data.data.pinStatus === 'setup_required' ? 'setup' : 'verify');
            setLoading(false);
            return;
          }

          // ── Fallback: legacy full-token response (shouldn't normally occur) ──
          login(data.data.token, {
            businessId:   data.data.business?.id,
            shortCode:    data.data.business?.short_code,
            businessName: data.data.business?.business_name || data.data.business?.name,
            workerId:     data.data.worker?.id,
            role:         data.data.worker?.role,
            workerName:   data.data.worker?.name || data.data.worker?.worker_name,
          });
          toast.success(data.message || 'Welcome back!');
          navigate('/dashboard');
        } catch (err) {
          console.error('Auth error:', err);
          const status = err.response?.status;
          const msg    = err.response?.data?.message || '';
          const noAccount =
            status === 404 ||
            (status === 400 && (msg.toLowerCase().includes('business name') || msg.toLowerCase().includes('company name')));

          if (noAccount) {
            toast.error('No account found. Please register your business first.', { duration: 5000 });
            await supabase.auth.signOut();
            setTimeout(() => navigate('/register'), 2000);
          } else {
            toast.error(msg || 'Authentication failed');
            await supabase.auth.signOut();
          }
        } finally {
          setLoading(false);
        }
      } catch (err) {
        console.error('OAuth session parse error:', err);
      }
    };

    handleOAuthCallback();
  }, [login, navigate]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login`,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error('Google sign-in error:', err);
      toast.error(err.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  // Show PIN modal (blocks access until PIN is set/verified)
  if (pinStep) {
    return <OwnerPinModal mode={pinStep} tempToken={tempToken} bizData={bizData} />;
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleGoogleLogin}
        disabled={loading}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        {loading ? (
          'Signing in...'
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </>
        )}
      </button>
      
      <p style={{ 
        fontSize: '0.85rem', 
        color: 'var(--text-secondary)', 
        textAlign: 'center',
        marginTop: '16px',
        lineHeight: '1.5'
      }}>
        Free, secure, and works with any Gmail account
      </p>
    </div>
  );
}

/* ── Worker PIN Login ──────────────────────── */
function WorkerLogin({ login, navigate }) {
  const { verifyToken } = useAuth();
  const [businessCode, setBusinessCode] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);

  const handlePinChange = (index, value) => {
    if (value.length > 1) return;
    const newPin = [...pin];
    newPin[index] = value.replace(/\D/g, '');
    setPin(newPin);
    // Auto-focus next input
    if (value && index < 3) {
      const next = document.getElementById(`pin-${index + 1}`);
      if (next) next.focus();
    }
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      const prev = document.getElementById(`pin-${index - 1}`);
      if (prev) prev.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fullPin = pin.join('');
    if (!businessCode) return toast.error('Enter your Business Code');
    if (fullPin.length < 4) return toast.error('Enter your 4-digit PIN');
    setLoading(true);
    try {
      const { data } = await authAPI.workerLogin({ business_code: businessCode, pin: fullPin });
      login(data.data.token, {
        businessId: data.data.worker.business_id,
        businessName: data.data.business?.business_name,
        workerId: data.data.worker.id,
        role: data.data.worker.role,
        workerName: data.data.worker.worker_name,
      });
      // refresh user object in case verifyToken returns additional info like businessName
      await verifyToken();
      toast.success(data.message || 'Welcome!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid PIN');
      setPin(['', '', '', '']);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label>Business Code</label>
        <input
          className="form-input"
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="Enter 4-digit code from your owner"
          value={businessCode}
          onChange={(e) => setBusinessCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
      </div>

      <div className="form-group">
        <label style={{ textAlign: 'center' }}>Enter your 4-digit PIN</label>
        <div className="pin-inputs">
          {pin.map((digit, i) => (
            <input
              key={i}
              id={`pin-${i}`}
              className="pin-input"
              type="password"
              maxLength={1}
              value={digit}
              onChange={(e) => handlePinChange(i, e.target.value)}
              onKeyDown={(e) => handlePinKeyDown(i, e)}
              autoFocus={i === 0}
            />
          ))}
        </div>
      </div>

      <button className="btn btn-primary" disabled={loading} type="submit">
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}

/* ── Shared Brand Panel ─────────────────────── */
function AuthBrand() {
  return (
    <div className="auth-brand">
      <div className="brand-logo">
        <div className="brand-logo-icon"><SikaBukLogo size={40} /></div>
        <span className="brand-logo-text">₵ikaBuk</span>
      </div>
      <h1>
        Run your business<br />
        with <span>clarity</span>
      </h1>
      <p>
        Every pesewa your shop makes, every product on your shelf, every
        profit you earn. ₵ikaBuk puts it all in one place so you can stop
        guessing and start growing.
      </p>
      <div className="auth-features">
        <div className="auth-feature">
          <div className="feature-dot">★</div>
          <span>Record every daily sale digitally. No more paper books.</span>
        </div>
        <div className="auth-feature">
          <div className="feature-dot">★</div>
          <span>Know your exact profit: daily, weekly, monthly, yearly.</span>
        </div>
        <div className="auth-feature">
          <div className="feature-dot">★</div>
          <span>Get alerts when stock runs low so you restock on time.</span>
        </div>
        <div className="auth-feature">
          <div className="feature-dot">★</div>
          <span>See your fastest-selling products every week.</span>
        </div>
      </div>
    </div>
  );
}
