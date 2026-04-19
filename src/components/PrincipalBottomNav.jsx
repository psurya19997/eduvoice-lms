import { NavLink } from 'react-router-dom';

export default function PrincipalBottomNav() {
  return (
    <nav className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 h-[70px] flex items-stretch pb-[env(safe-area-inset-bottom)]">
      <Tab to="/principal" label="Dashboard" icon="🏠" />
      <Tab to="/principal/teachers" label="Teachers" icon="👥" />
      <Tab to="/principal/courses" label="Courses" icon="📚" />
      <Tab to="/principal/requests" label="Requests" icon="📝" />
    </nav>
  );
}
function Tab({ to, label, icon }) {
  return (
    <NavLink to={to} end className={({ isActive }) => `
      flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition
      ${isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}
    `}>
      <span className="text-[18px] leading-none">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}
