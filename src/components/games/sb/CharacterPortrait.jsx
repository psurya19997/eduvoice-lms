import { useMemo } from 'react';
import { supabase } from '../../../lib/supabase.js';

export default function CharacterPortrait({ character, className = '' }) {
  const publicImageUrl = useMemo(() => {
    if (!character?.portrait_url) return null;
    const { data } = supabase.storage.from('game-assets').getPublicUrl(character.portrait_url);
    return data.publicUrl;
  }, [character?.portrait_url]);

  if (!character) return null;

  return (
    <div className={`flex flex-col items-center gap-1.5 shrink-0 ${className}`}>
      <div className="w-16 h-16 rounded-full bg-slate-200 ring-2 ring-white shadow-md overflow-hidden shrink-0">
        {publicImageUrl ? (
          <img src={publicImageUrl} alt={character.display_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold">?</div>
        )}
      </div>
      <div className="text-[11px] font-extrabold text-slate-600 bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm ring-1 ring-slate-200/50">
        {character.display_name}
      </div>
    </div>
  );
}
