import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from '../../utils/notify';
import SikaBukLogo from '../../components/SikaBukLogo';
import OwnerPinModal from '../../components/OwnerPinModal';
import './AuthRedesign.css';

export default function RegisterPage() {
  const [businessName, setBusinessName] = useState('');
  const [whatsAppPhone, setWhatsAppPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBusinessNameForm, setShowBusinessNameForm] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  // PIN gate state — set after registration to force PIN setup
  const [pinStep,   setPinStep]   = useState(null);
  const [tempToken, setTempToken] = useState(null);
  const [bizData,   setBizData]   = useState(null);
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    // Parse OAuth redirect (supports Supabase hash or query formats). If no
    // token is present in the URL, fall back to the persisted session.
    const handleOAuthCallback = async () => {
      try {
        // Try to extract access_token directly from URL (fragment or query)
        const raw = window.location.hash || window.location.search || '';
        let accessFromUrl = null;
        if (raw) {
          const params = new URLSearchParams(raw.replace(/^#|^\?/, ''));
          accessFromUrl = params.get('access_token') || params.get('accessToken');
        }

        if (accessFromUrl) {
          setAccessToken(accessFromUrl);
          setShowBusinessNameForm(true);
          // Clean up URL so tokens are not left visible
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          return;
        }

        // Fallback to persisted session (if Supabase already parsed it)
        const res = await supabase.auth.getSession();
        const session = res?.data?.session;
        if (session) {
          setAccessToken(session.access_token);
          setShowBusinessNameForm(true);
        }
      } catch (err) {
        console.error('OAuth session parse error:', err);
      }
    };

    handleOAuthCallback();
  }, []);

  const handleGoogleSignup = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/register`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
      
      // User will be redirected to Google, then back to /register
    } catch (err) {
      console.error('Google sign-up error:', err);
      toast.error(err.message || 'Failed to sign up with Google');
      setLoading(false);
    }
  };

  const handleBusinessSetup = async (e) => {
    e.preventDefault();
    console.log('[RegisterPage] handleBusinessSetup start, businessName=', businessName, 'accessToken=', accessToken);
    if (!businessName.trim() || businessName.length < 2) {
      return toast.error('Enter your business name (minimum 2 characters)');
    }

    // Ensure we actually have a Supabase access token from the OAuth flow
    if (!accessToken) {
      toast.error('Authentication session missing — please sign in with Google again');
      // Clear any partial session and prompt user to re-authenticate
      await supabase.auth.signOut();
      setShowBusinessNameForm(false);
      return setLoading(false);
    }

    setLoading(true);
    // guard to avoid hanging forever in case something goes wrong
    const safety = setTimeout(() => {
      if (loading) {
        console.warn('[RegisterPage] business setup timeout');
        toast.error('Registration is taking too long, please try again.');
        setLoading(false);
      }
    }, 20000);

    try {
      // Send to backend with business name for registration
      const { data } = await authAPI.supabaseAuth({ 
        accessToken,
        business_name: businessName.trim(),
        whatsapp_phone: whatsAppPhone.trim() || undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      console.log('[RegisterPage] supabaseAuth response', data);

      // ── New flow: backend returns tempToken + pinStatus ──
      if (data?.data?.tempToken && data?.data?.pinStatus) {
        setTempToken(data.data.tempToken);
        setBizData({ business: data.data.business, worker: data.data.worker, isNewBusiness: data.data.isNewBusiness });
        setPinStep('setup'); // New registrations always start with PIN setup
        setLoading(false);
        clearTimeout(safety);
        return;
      }

      // ── Fallback: legacy token-only response ──
      const token = data?.data?.token;
      if (!token) {
        console.error('No token returned from supabaseAuth:', data);
        toast.error('Registration succeeded but no token was returned. Try signing in.');
        setLoading(false);
        return;
      }

      login(token, {
        businessId: data.data.business?.id,
        shortCode: data.data.business?.short_code,
        businessName: data.data.business?.business_name || data.data.business?.name,
        workerId: data.data.worker?.id,
        role: data.data.worker?.role,
        workerName: data.data.worker?.name || data.data.worker?.worker_name,
      });

      toast.success('Business account created successfully!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('Registration error:', err);
      toast.error(err.response?.data?.message || 'Registration failed');
      // Clear session on error
      await supabase.auth.signOut();
      setShowBusinessNameForm(false);
      setAccessToken(null);
    } finally {
      clearTimeout(safety);
      setLoading(false);
    }
  };

  // Show PIN setup modal (non-dismissable — owner must set a PIN before using the app)
  if (pinStep) {
    return <OwnerPinModal mode={pinStep} tempToken={tempToken} bizData={bizData} />;
  }

  if (showBusinessNameForm) {
    return (
      <div className="auth-page">
        <AuthBrand />
        <div className="auth-form-panel">
          <div className="auth-card">
            <div className="auth-mobile-logo">
              <div className="brand-logo-icon"><SikaBukLogo size={38} /></div>
              <div className="brand-name">₵ikaBuk</div>
            </div>

            <h2>Complete Setup</h2>
            <p className="auth-subtitle">What's your company name?</p>

            <form onSubmit={handleBusinessSetup}>
              <div className="form-group">
                <label>Company Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Afia's Provisions Store"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  autoFocus
                  disabled={loading}
                />
                <p style={{ 
                  fontSize: '0.8rem', 
                  color: 'var(--text-secondary)', 
                  marginTop: '6px',
                  lineHeight: '1.4'
                }}>
                  This will be your company's identity in ₵ikaBuk
                </p>
              </div>

              <div className="form-group">
                <label>WhatsApp Number <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input
                  className="form-input"
                  type="tel"
                  placeholder="e.g. 0201234567"
                  value={whatsAppPhone}
                  onChange={(e) => setWhatsAppPhone(e.target.value)}
                  disabled={loading}
                />
                <p style={{ 
                  fontSize: '0.8rem', 
                  color: 'var(--text-secondary)', 
                  marginTop: '6px',
                  lineHeight: '1.4'
                }}>
                  Receive instant WhatsApp alerts when workers submit requests
                </p>
              </div>

              <button className="btn btn-primary" disabled={loading} type="submit">
                {loading ? 'Creating account...' : 'Create Business Account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <AuthBrand />
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-mobile-logo">
            <div className="brand-logo-icon"><SikaBukLogo size={38} /></div>
            <div className="brand-name">₵ikaBuk</div>
          </div>

          <h2>Start your journey</h2>
          <p className="auth-subtitle">Set up your money book in 2 minutes</p>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGoogleSignup}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
            }}
          >
            {loading ? (
              'Setting up...'
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign up with Google
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
            Free forever. No credit card needed.
          </p>

          <div className="auth-link">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthBrand() {
  return (
    <div className="auth-brand">
      <div className="brand-logo">
        <div className="brand-logo-icon"><SikaBukLogo size={40} /></div>
        <span className="brand-logo-text">₵ikaBuk</span>
      </div>
      <h1>
        Your business<br />
        deserves <span>better</span>
      </h1>
      <p>
        You work hard every day but still can't tell how much profit you
        actually made. ₵ikaBuk gives you the full picture of your business
        so every decision you make is backed by real numbers.
      </p>
      <div className="auth-features">
        <div className="auth-feature">
          <div className="feature-dot">★</div>
          <span>Move your sales from paper to a smart digital record.</span>
        </div>
        <div className="auth-feature">
          <div className="feature-dot">★</div>
          <span>See your true profit: daily, weekly, monthly, yearly.</span>
        </div>
        <div className="auth-feature">
          <div className="feature-dot">★</div>
          <span>Automatic stock alerts so you never run out of products.</span>
        </div>
        <div className="auth-feature">
          <div className="feature-dot">★</div>
          <span>Weekly reports on your top-selling products.</span>
        </div>
      </div>
    </div>
  );
}
