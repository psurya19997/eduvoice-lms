// STComplete — end-of-story screen for Phase 1.
// Assessment (summary + Q&A) is Phase 2; for now this is a positive-framed
// placeholder that celebrates finishing without over-promising a score.

import { useSearchParams, useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';

export default function STComplete() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const level = params.get('level') ?? 'alpha';

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 shrink-0 bg-white border-b border-slate-200">
        <BackButton to={`/student/games/storyteller?level=${level}`} />
        <h1 className="text-[16px] font-black text-slate-900 leading-tight">Story Teller</h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm flex flex-col items-center text-center gap-4">
          <div className="text-6xl">🎉</div>
          <h2 className="text-2xl font-black text-slate-900">Great reading!</h2>
          <p className="text-[14px] font-semibold text-slate-600 leading-relaxed">
            You finished the story. Soon you'll be able to tell it back in your
            own words and earn points — <span className="text-rose-700 font-black">coming soon.</span>
          </p>

          <div className="w-full flex flex-col gap-2 mt-2">
            <button
              type="button"
              onClick={() => navigate(`/student/games/storyteller?level=${level}`)}
              className="w-full h-12 rounded-2xl bg-rose-600 text-white text-[15px] font-black shadow-md hover:bg-rose-700 active:scale-[0.98] transition"
            >
              Pick another story
            </button>
            <button
              type="button"
              onClick={() => navigate('/student/games')}
              className="w-full h-11 rounded-2xl bg-white text-slate-700 ring-1 ring-slate-200 text-[14px] font-extrabold active:scale-[0.98] transition"
            >
              Back to Games
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
