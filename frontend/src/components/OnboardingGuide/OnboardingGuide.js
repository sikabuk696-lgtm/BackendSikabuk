import React, { useState } from 'react';
import {
  HiOutlineSparkles,
  HiOutlineChartBar,
  HiOutlineCube,
  HiOutlineUserGroup,
  HiOutlineLightningBolt,
} from 'react-icons/hi';
import './OnboardingGuide.css';

const STORAGE_KEY = 'sikabuk_onboarding_v1';

const STEPS = [
  {
    Icon:  HiOutlineSparkles,
    color: '#C8860A',
    title: 'Welcome to SikaBuk!',
    desc:  "Your smart business management system is ready. Let's take a quick tour so you know exactly where everything is.",
  },
  {
    Icon:  HiOutlineChartBar,
    color: '#C8962E',
    title: 'Your Dashboard',
    desc:  "Your homepage shows today's sales, expenses, profit and low stock alerts at a glance - all filtered by whichever shop you select in the top bar.",
  },
  {
    Icon:  HiOutlineCube,
    color: '#10B981',
    title: 'Products & Sales',
    desc:  'Add products with their cost price, selling price and starting stock. Record sales in seconds - credit sales are automatically tracked against customers.',
  },
  {
    Icon:  HiOutlineUserGroup,
    color: '#8B5CF6',
    title: 'Workers & Approvals',
    desc:  'Add workers, give them a 4-digit PIN and assign them to a shop. Any changes they make go to Approvals for you to review before they take effect.',
  },
  {
    Icon:  HiOutlineLightningBolt,
    color: '#EF4444',
    title: "You're all set!",
    desc:  'Start by adding your first product, then share your Business Code with your workers so they can log in.',
  },
];

export default function OnboardingGuide({ onDone }) {
  const [step, setStep] = useState(0);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'done');
    onDone();
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else dismiss();
  };

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const { Icon, color } = current;

  return (
    <div className="ob-overlay" onClick={(e) => e.target === e.currentTarget && dismiss()}>
      <div className="ob-card">
        {/* Skip button */}
        {!isLast && (
          <button className="ob-skip" onClick={dismiss}>Skip tour</button>
        )}

        {/* Icon illustration */}
        <div className="ob-icon-wrap" style={{ background: color + '18', color }}>
          <Icon className="ob-icon" />
        </div>

        {/* Content */}
        <h2 className="ob-title">{current.title}</h2>
        <p className="ob-desc">{current.desc}</p>

        {/* Step dots */}
        <div className="ob-dots">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`ob-dot ${i === step ? 'active' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        {/* Action buttons */}
        <div className="ob-actions">
          {step > 0 && (
            <button className="ob-btn ob-btn-back" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button className="ob-btn ob-btn-next" onClick={next}>
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Returns true if the onboarding guide should be shown */
export function shouldShowOnboarding() {
  try {
    // Flag set by OwnerPinModal on new business registration
    const showFlag = localStorage.getItem('sikabuk_show_onboarding');
    // Already completed guide
    const done     = localStorage.getItem(STORAGE_KEY);
    return showFlag === 'true' && done !== 'done';
  } catch {
    return false;
  }
}

/** Clear the trigger flag (called when guide is mounted) */
export function clearOnboardingFlag() {
  try { localStorage.removeItem('sikabuk_show_onboarding'); } catch (_) {}
}
