import { useState, useEffect } from 'react';

const ONBOARDING_KEY = 'onboarding_done_v1';

interface OnboardingProps {
  onDone: () => void;
}

const slides = [
  {
    icon: '⚡',
    gradient: 'from-blue-600 to-indigo-700',
    badge: 'SBPDCL',
    title: 'Fastest Way to Pay',
    titleHighlight: 'SBPDCL Bills',
    desc: 'Check your live balance and recharge in just a few taps. No more long queues or website hassles.',
    dotColor: 'bg-blue-500',
  },
  {
    icon: '🔒',
    gradient: 'from-emerald-600 to-teal-700',
    badge: '100% Private',
    title: 'Your Data Stays',
    titleHighlight: 'On Your Phone',
    desc: 'No accounts, no logins, no cloud storage. Your CA number and details never leave your device.',
    dotColor: 'bg-emerald-500',
  },
  {
    icon: '🚀',
    gradient: 'from-violet-600 to-purple-700',
    badge: 'Let\'s Begin',
    title: 'Add Your First',
    titleHighlight: 'CA Number',
    desc: 'Tap "Get Started" to save your first meter. You can add multiple meters for your whole family!',
    dotColor: 'bg-violet-500',
  },
];

export function Onboarding({ onDone }: OnboardingProps) {
  const [current, setCurrent] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [exiting, setExiting] = useState(false);

  const slide = slides[current];
  const isLast = current === slides.length - 1;

  const goNext = () => {
    if (isLast) {
      handleDone();
    } else {
      setCurrent(c => c + 1);
    }
  };

  const handleDone = () => {
    setExiting(true);
    setTimeout(() => {
      localStorage.setItem(ONBOARDING_KEY, 'true');
      onDone();
    }, 350);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const delta = touchStart - e.changedTouches[0].clientX;
    if (delta > 50 && current < slides.length - 1) setCurrent(c => c + 1);
    if (delta < -50 && current > 0) setCurrent(c => c - 1);
    setTouchStart(null);
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col transition-opacity duration-350 ${exiting ? 'opacity-0' : 'opacity-100'}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${slide.gradient} transition-all duration-500`} />

      {/* Decorative circles */}
      <div className="absolute top-[-60px] right-[-60px] w-72 h-72 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute bottom-[-40px] left-[-40px] w-56 h-56 rounded-full bg-white/10 blur-2xl" />

      {/* Skip button */}
      {!isLast && (
        <button
          onClick={handleDone}
          className="absolute top-12 right-6 text-white/70 text-sm font-medium px-3 py-1.5 rounded-full border border-white/20 hover:bg-white/10 transition-all z-10"
        >
          Skip
        </button>
      )}

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-8 text-center">
        {/* Icon circle */}
        <div
          className="w-28 h-28 rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-8 shadow-2xl border border-white/30"
          style={{ animation: 'onboardingPop 0.5s cubic-bezier(0.34,1.56,0.64,1)' }}
        >
          <span className="text-6xl">{slide.icon}</span>
        </div>

        {/* Badge */}
        <span className="inline-block px-4 py-1 rounded-full bg-white/20 text-white/90 text-xs font-bold tracking-widest uppercase mb-4 border border-white/30">
          {slide.badge}
        </span>

        {/* Title */}
        <h1 className="text-4xl font-extrabold text-white leading-tight mb-2">
          {slide.title}<br />
          <span className="text-yellow-300">{slide.titleHighlight}</span>
        </h1>

        {/* Description */}
        <p className="text-white/80 text-base leading-relaxed max-w-xs mt-4">
          {slide.desc}
        </p>
      </div>

      {/* Bottom area */}
      <div className="relative pb-16 px-8 flex flex-col items-center gap-6">
        {/* Dot indicators */}
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`rounded-full transition-all duration-300 ${
                i === current ? 'w-8 h-2.5 bg-white' : 'w-2.5 h-2.5 bg-white/40'
              }`}
            />
          ))}
        </div>

        {/* Action button */}
        <button
          onClick={goNext}
          className="w-full max-w-xs py-4 rounded-2xl bg-white font-bold text-lg shadow-2xl active:scale-95 transition-all duration-150"
          style={{ color: 'var(--tw-gradient-from, #2563eb)' }}
        >
          {isLast ? '🚀 Get Started' : 'Next →'}
        </button>
      </div>

      <style>{`
        @keyframes onboardingPop {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/** Returns true if onboarding has already been completed OR the user is an existing user with saved meters */
export function hasCompletedOnboarding(): boolean {
  if (localStorage.getItem(ONBOARDING_KEY) === 'true') return true;
  // Treat existing users (those with saved meters) as having completed onboarding
  try {
    const saved = localStorage.getItem('sbpdcl_consumers');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Mark it as done so we don't check again
        localStorage.setItem(ONBOARDING_KEY, 'true');
        return true;
      }
    }
  } catch (_) {}
  return false;
}
