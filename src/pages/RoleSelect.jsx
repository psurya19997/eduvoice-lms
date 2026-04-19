import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';

/**
 * Role Selection — student or teacher.
 * Principal / Super Admin accounts are created by higher roles, so they
 * don't appear here (they use /login directly).
 */
export default function RoleSelect() {
  const [selected, setSelected] = useState(null); // 'student' | 'teacher'
  const navigate = useNavigate();

  const handleContinue = () => {
    if (!selected) return;
    navigate(selected === 'student' ? '/signup/student' : '/signup/teacher');
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="pt-6 px-5 pb-2 flex items-center gap-3">
        <BackButton to="/" />
        <div className="flex-1" />
      </div>

      {/* Title */}
      <div className="px-6 pt-2">
        <h1 className="text-[26px] leading-tight font-black text-slate-900">
          Join EduVoice
        </h1>
        <p className="mt-1.5 text-[15px] font-medium text-slate-500">
          Tell us who you are so we can set up the right experience.
        </p>
      </div>

      {/* Role cards */}
      <div className="flex-1 px-5 pt-8 flex flex-col gap-4">
        <RoleCard
          role="student"
          selected={selected === 'student'}
          onSelect={() => setSelected('student')}
          emoji="🎓"
          title="I'm a Student"
          subtitle="Submit assignments, earn streaks, climb the leaderboard."
          accent="from-pink-400 to-rose-500"
        />
        <RoleCard
          role="teacher"
          selected={selected === 'teacher'}
          onSelect={() => setSelected('teacher')}
          emoji="👩‍🏫"
          title="I'm a Teacher"
          subtitle="Create courses and assignments, review submissions."
          accent="from-indigo-500 to-violet-600"
        />

        {/* Small note pointing principals/admins to login */}
        <div className="mt-auto text-center text-[13px] font-semibold text-slate-500 pt-4 pb-2">
          Principal or Super Admin?{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-indigo-600 hover:text-indigo-700 underline underline-offset-2"
          >
            Log in here
          </button>
        </div>
      </div>

      {/* Continue */}
      <div className="px-5 pb-8 pt-3">
        <button
          type="button"
          onClick={handleContinue}
          disabled={!selected}
          className={`
            w-full h-14 rounded-2xl text-base font-extrabold
            flex items-center justify-center
            transition
            ${selected
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
          `}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function RoleCard({ selected, onSelect, emoji, title, subtitle, accent }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        relative text-left w-full rounded-3xl p-5
        bg-white ring-1 transition
        ${selected
          ? 'ring-2 ring-indigo-500 shadow-xl shadow-indigo-500/10'
          : 'ring-slate-200 shadow-sm hover:ring-slate-300'}
        active:scale-[0.99]
      `}
    >
      <div className="flex items-center gap-4">
        <div
          className={`
            w-14 h-14 rounded-2xl bg-gradient-to-br ${accent}
            flex items-center justify-center text-3xl shadow-md
            shrink-0
          `}
        >
          <span role="img" aria-hidden="true">{emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-extrabold text-slate-900 leading-tight">
            {title}
          </div>
          <div className="mt-1 text-[13px] font-medium text-slate-500 leading-snug">
            {subtitle}
          </div>
        </div>
        {/* Selected check */}
        <div
          className={`
            w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition
            ${selected
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-transparent ring-1 ring-slate-200'}
          `}
          aria-hidden="true"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 10.5l3.5 3.5 7-7"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </button>
  );
}
