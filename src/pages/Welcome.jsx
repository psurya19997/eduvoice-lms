import { Link } from 'react-router-dom';

/**
 * Welcome screen — landing page.
 * Two CTAs: Get Started (→ role selection) and Log In.
 */
export default function Welcome() {
  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-indigo-500 via-indigo-600 to-purple-700 text-white">
      {/* Decorative floating blobs */}
      <div className="absolute top-10 -left-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
      <div className="absolute top-40 -right-10 w-40 h-40 bg-yellow-300/20 rounded-full blur-2xl" />
      <div className="absolute bottom-40 -left-12 w-36 h-36 bg-pink-400/20 rounded-full blur-2xl" />

      {/* Top area — brand + hero */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pt-10">
        {/* Mascot / logo */}
        <div className="relative mb-6">
          <div className="w-28 h-28 rounded-[28px] bg-white/15 backdrop-blur-sm ring-1 ring-white/25 flex items-center justify-center shadow-xl">
            <span className="text-6xl leading-none select-none" role="img" aria-label="microphone">
              🎙️
            </span>
          </div>
          {/* Little badge */}
          <div className="absolute -top-2 -right-2 w-9 h-9 rounded-full bg-yellow-400 text-indigo-900 flex items-center justify-center shadow-lg ring-2 ring-white/80">
            <span className="text-lg" role="img" aria-label="star">
              ⭐
            </span>
          </div>
        </div>

        {/* Wordmark */}
        <h1 className="text-4xl font-black tracking-tight">EduVoice</h1>
        <p className="mt-1 text-sm font-bold tracking-[0.2em] text-white/70 uppercase">
          Learn · Speak · Shine
        </p>

        {/* Tagline */}
        <p className="mt-8 text-center text-base font-medium leading-relaxed text-white/90 max-w-[280px]">
          Record your voice, climb leaderboards, and earn streaks with every
          assignment.
        </p>

        {/* Feature chips */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Chip emoji="🔥" label="Daily streaks" />
          <Chip emoji="🏆" label="Top 5 badges" />
          <Chip emoji="🎤" label="Voice answers" />
        </div>
      </div>

      {/* Bottom action area */}
      <div className="relative px-6 pb-8 pt-6 flex flex-col gap-3">
        <Link
          to="/signup"
          className="
            h-14 rounded-2xl bg-white text-indigo-700
            flex items-center justify-center
            text-base font-extrabold
            shadow-lg shadow-indigo-900/20
            active:scale-[0.98] transition
          "
        >
          Get Started
        </Link>
        <Link
          to="/login"
          className="
            h-14 rounded-2xl bg-white/10 text-white ring-1 ring-white/30 backdrop-blur-sm
            flex items-center justify-center
            text-base font-extrabold
            active:scale-[0.98] transition
          "
        >
          I already have an account
        </Link>
        <p className="text-center text-xs font-semibold text-white/60 pt-2">
          For schools · Built for mobile
        </p>
      </div>
    </div>
  );
}

function Chip({ emoji, label }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
      <span className="text-sm" role="img" aria-hidden="true">
        {emoji}
      </span>
      <span className="text-xs font-bold text-white/95">{label}</span>
    </div>
  );
}
