import React, { useState, useRef } from 'react';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from '../utils/notify';
import SikaBukLogo from './SikaBukLogo';
import './OwnerPinModal.css';

/**
 * OwnerPinModal
 *
 * Full-screen, non-dismissable overlay shown after a successful Google OAuth
 * login. The owner must either:
 *  - Set up a new 4-digit security PIN  (mode = 'setup')
 *  - Verify their existing PIN          (mode = 'verify')
 *
 * On success it exchanges the short-lived tempToken for the real JWT,
 * calls `login()`, and navigates to the dashboard.
 *
 * Props:
 *   mode       'setup' | 'verify'
 *   tempToken  string  (the 15-minute pin_pending JWT from the backend)
 *   bizData    { business, worker, isNewBusiness }  (metadata for display)
 */
export default function OwnerPinModal({ mode, tempToken, bizData }) {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [pin,     setPin]     = useState(['', '', '', '']);
  const [confPin, setConfPin] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);

  const pinRefs  = [useRef(), useRef(), useRef(), useRef()];
  const confRefs = [useRef(), useRef(), useRef(), useRef()];

  const handleDigit = (refs, setter, arr, index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next  = [...arr];
    next[index] = digit;
    setter(next);
    if (digit && index < 3) refs[index + 1].current?.focus();
  };

  const handleKeyDown = (refs, arr, setter, index, e) => {
    if (e.key === 'Backspace' && !arr[index] && index > 0) {
      const next = [...arr];
      next[index - 1] = '';
      setter(next);
      refs[index - 1].current?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fullPin = pin.join('');

    if (fullPin.length < 4) {
      return toast.error('Please enter all 4 digits');
    }

    if (mode === 'setup') {
      const fullConf = confPin.join('');
      if (fullConf.length < 4) return toast.error('Please confirm your PIN');
      if (fullPin !== fullConf)  return toast.error('PINs do not match. Please re-enter.');
    }

    setLoading(true);
    try {
      let result;
      if (mode === 'setup') {
        result = await authAPI.ownerPinSetup({ tempToken, pin: fullPin });
      } else {
        result = await authAPI.ownerPinVerify({ tempToken, pin: fullPin });
      }

      const token = result.data?.data?.token;
      if (!token) throw new Error('No token returned');

      login(token, {
        businessId:   bizData?.business?.id,
        shortCode:    bizData?.business?.short_code,
        businessName: bizData?.business?.business_name,
        workerId:     bizData?.worker?.id,
        role:         bizData?.worker?.role,
        workerName:   bizData?.worker?.name || bizData?.worker?.worker_name,
      });

      // Show onboarding guide for brand-new businesses.
      // Also clear any stale keys so re-registrants get a clean slate.
      if (mode === 'setup' && bizData?.isNewBusiness) {
        try {
          localStorage.setItem('sikabuk_show_onboarding', 'true');
          localStorage.removeItem('sikabuk_onboarding_v1');   // reset guide "done" flag
          localStorage.removeItem('sikabuk_activeLocationId'); // reset shop selection
        } catch (_) {}
      }

      toast.success(
        mode === 'setup'
          ? 'PIN set up! Welcome to ₵ikaBuk.'
          : result.data?.message || 'Welcome back!'
      );
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Something went wrong';
      toast.error(msg);
      // Clear PIN inputs on wrong PIN
      setPin(['', '', '', '']);
      setConfPin(['', '', '', '']);
      setTimeout(() => pinRefs[0].current?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pin-overlay">
      <div className="pin-modal">
        {/* Brand header */}
        <div className="pin-brand">
          <div className="brand-logo-icon"><SikaBukLogo size={34} /></div>
          <span className="brand-name">₵ikaBuk</span>
        </div>

        {mode === 'setup' ? (
          <>
            <h2 className="pin-title">Set Your Security PIN</h2>
            <p className="pin-desc">
              Choose a 4-digit PIN that only you know. You&apos;ll need to enter
              it every time you log in with Google to protect your account from
              unauthorised access.
            </p>
          </>
        ) : (
          <>
            <h2 className="pin-title">Enter Your Security PIN</h2>
            <p className="pin-desc">
              Hello, <strong>{bizData?.business?.business_name}</strong>!
              Enter your 4-digit PIN to verify it&apos;s really you.
            </p>
          </>
        )}

        <form onSubmit={handleSubmit} className="pin-form">
          {/* Main PIN row */}
          <div className="pin-label">{mode === 'setup' ? 'Choose a PIN' : 'Your PIN'}</div>
          <div className="pin-inputs">
            {pin.map((d, i) => (
              <input
                key={i}
                ref={pinRefs[i]}
                className="pin-input"
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={d}
                autoFocus={i === 0}
                onChange={e => handleDigit(pinRefs, setPin, pin, i, e.target.value)}
                onKeyDown={e => handleKeyDown(pinRefs, pin, setPin, i, e)}
              />
            ))}
          </div>

          {/* Confirm row (setup only) */}
          {mode === 'setup' && (
            <>
              <div className="pin-label" style={{ marginTop: 18 }}>Confirm PIN</div>
              <div className="pin-inputs">
                {confPin.map((d, i) => (
                  <input
                    key={i}
                    ref={confRefs[i]}
                    className="pin-input"
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigit(confRefs, setConfPin, confPin, i, e.target.value)}
                    onKeyDown={e => handleKeyDown(confRefs, confPin, setConfPin, i, e)}
                  />
                ))}
              </div>
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary pin-submit"
            disabled={loading}
          >
            {loading
              ? 'Verifying…'
              : mode === 'setup'
                ? 'Set PIN & Continue'
                : 'Verify PIN'}
          </button>
        </form>

        <p className="pin-footer-note">
          {mode === 'setup'
            ? 'Keep your PIN safe. It cannot be recovered automatically.'
            : 'Forgot your PIN? Contact support to reset your account.'}
        </p>
      </div>
    </div>
  );
}
