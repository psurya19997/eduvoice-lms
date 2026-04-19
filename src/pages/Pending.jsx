import { Link } from 'react-router-dom';

/**
 * Shown after a teacher signs up when their school requires principal
 * approval. Simple message + login link (so they can check back later).
 */
export default function Pending() {
  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-amber-50 to-slate-50">
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-24 h-24 rounded-[28px] bg-amber-100 ring-1 ring-amber-200 flex items-center justify-center shadow-inner mb-5">
          <span className="text-5xl" role="img" aria-label="hourglass">⏳</span>
        </div>
        <h1 className="text-[26px] leading-tight font-black text-slate-900">
          You're on the list!
        </h1>
        <p className="mt-2 text-[15px] font-medium text-slate-500 max-w-[280px]">
          Your account is pending approval by the school principal.
          We'll let you in as soon as they approve.
        </p>

        <div className="mt-8 bg-white ring-1 ring-slate-200 rounded-2xl p-4 text-left w-full max-w-[300px]">
          <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            What's next
          </p>
          <ul className="flex flex-col gap-2 text-[13px] font-semibold text-slate-700">
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 font-black">1.</span>
              Principal reviews teacher requests in their dashboard.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 font-black">2.</span>
              Once approved, log in with your email + password.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 font-black">3.</span>
              Start creating courses and assignments.
            </li>
          </ul>
        </div>
      </div>

      <div className="px-5 pb-8 pt-4">
        <Link
          to="/login"
          className="w-full h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-base font-extrabold shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition"
        >
          Go to login
        </Link>
      </div>
    </div>
  );
}
