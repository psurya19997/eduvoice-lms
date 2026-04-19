import { NavLink } from 'react-router-dom';

/**
 * Bottom tab bar for teacher screens.
 * Sits absolutely at the bottom of the PhoneFrame.
 */
export default function TeacherBottomNav() {
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
      <Tab to="/teacher" label="Dashboard" icon={HomeIcon} />
      <Tab to="/teacher/profile" label="Profile" icon={UserIcon} />
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
function BookIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5z"
        stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.15 : 0}
      />
      <path d="M4 19a2 2 0 0 0 2 2h12" stroke="currentColor" strokeWidth="2" />
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
