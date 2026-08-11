// Games hub — Game Zone grid.
// MVP-1: only Word Family and Sentence Builder are playable; other games render as "Coming soon".

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';
import StudentBottomNav from '../components/StudentBottomNav.jsx';
import BackButton from '../components/BackButton.jsx';

export default function GamesHub() {
  const navigate = useNavigate();
  const { loading: authLoading } = useAuthProfile('student');
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('games')
        .select('id, key, display_name, icon, sort_order, is_active')
        .order('sort_order', { ascending: true });
      setGames(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (authLoading) return <Spinner />;

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <BackButton to="/student" />
        <h1 className="text-[18px] font-extrabold text-slate-900">Games</h1>
        <div className="w-8" />
      </div>

      <div className="px-5 pt-2 pb-6 flex-1">
        {loading ? <Spinner /> : (
          <ZoneTab
            games={games}
            onOpenWF={() => navigate('/student/games/word-family')}
            onOpenSB={() => navigate('/student/games/sentence-builder')}
            onOpenST={() => navigate('/student/games/storyteller')}
          />
        )}
      </div>

      <StudentBottomNav />
    </div>
  );
}

function ZoneTab({ games, onOpenWF, onOpenSB, onOpenST }) {
  const openMap = { word_family: onOpenWF, sentence_builder: onOpenSB, story_teller: onOpenST };
  const activeGames = games.filter((g) => g.is_active);
  return (
    <div className="grid grid-cols-2 gap-3">
      {activeGames.map((g) => (
        <GameCard
          key={g.id}
          game={g}
          onClick={openMap[g.key]}
        />
      ))}
    </div>
  );
}

function GameCard({ game, onClick }) {
  const disabled = !onClick;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        relative aspect-square rounded-2xl p-3
        ring-1 flex flex-col items-center justify-center gap-1
        ${disabled
          ? 'bg-slate-50 ring-slate-200 text-slate-400'
          : 'bg-white ring-slate-200 text-slate-800 hover:ring-slate-300 active:scale-[0.98] shadow-sm'}
        transition
      `}
    >
      <div className="text-4xl">{game.icon}</div>
      <div className="text-[12px] font-extrabold text-center">{game.display_name}</div>
    </button>
  );
}

function Spinner() {
  return (
    <div className="h-full flex items-center justify-center py-20">
      <svg className="animate-spin text-indigo-600" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}
