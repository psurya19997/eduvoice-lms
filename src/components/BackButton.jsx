import { useNavigate } from 'react-router-dom';

/**
 * Circular back button used in the top-left of most screens.
 * Falls back to `to` prop if there's no history to go back to.
 */
export default function BackButton({ to = '/', className = '' }) {
  const navigate = useNavigate();
  const handleClick = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(to);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Go back"
      className={`
        w-11 h-11 rounded-full bg-white/70 hover:bg-white
        ring-1 ring-slate-200 shadow-sm
        flex items-center justify-center
        active:scale-95 transition
        ${className}
      `}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M12.5 4L6.5 10l6 6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-slate-700"
        />
      </svg>
    </button>
  );
}
