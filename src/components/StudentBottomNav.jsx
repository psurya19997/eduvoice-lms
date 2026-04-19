import { NavLink } from 'react-router-dom';

/**
 * Bottom tab bar for student screens.
 * Sits absolutely at the bottom of the PhoneFrame.
 */
export default function StudentBottomNav() {
  return (
    <nav
      className="
        absolute bottom-0 left-0 right-0
        bg-white/95 backdrop-blur
        border-t border-slate-200
        h-[70px] flex items-stretch
        pb-[env(safe-area-inset-bottom)]
      "
    >
      <Tab to="/student" label="Home" icon={HomeIcon} />
      <Tab to="/student/leaderboard" label="Leaderboard" icon={TrophyIcon} />
      <Tab to="/student/badges" label="Badges" icon={MedalIcon} />
      <Tab to="/student/profile" label="Profile" icon={UserIcon} />
    </nav>
  );
}

function Tab({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) => `
        flex-1 flex flex-col items-center justify-center gap-0.5
        text-[11px] font-bold transition
        ${isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}
      `}
    >
      {({ isActive }) => (
        <>
          <Icon active={isActive} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function HomeIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2v-9z"
        stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.15 : 0}
      />
    </svg>
  );
}
function TrophyIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 4h10v5a5 5 0 0 1-10 0V4z"
        stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.15 : 0}
      />
      <path d="M5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M9 20h6M12 14v6"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function MedalIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="15" r="5"
        stroke="currentColor" strokeWidth="2"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.15 : 0} />
      <path d="M8 3l4 6 4-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function UserIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"
              fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
      <path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
