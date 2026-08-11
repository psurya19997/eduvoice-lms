import SentenceCanvas from './SentenceCanvas.jsx';
import TileBank from './TileBank.jsx';
import CharacterPortrait from './CharacterPortrait.jsx';
import SpeechBubble from './SpeechBubble.jsx';
import HintPanel from './HintPanel.jsx';
import { supabase } from '../../../lib/supabase.js';
import { useMemo } from 'react';

export default function RecastBody({ session, character, placements, onPlace, onUndo, disabled, onOpenHint }) {
  // If there's an image, get its public URL
  const publicImageUrl = useMemo(() => {
    if (!session?.image_url) return null;
    const { data } = supabase.storage.from('game-assets').getPublicUrl(session.image_url);
    return data.publicUrl;
  }, [session?.image_url]);

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3">
      {/* Optional Context Image */}
      {publicImageUrl && (
        <div className="w-full aspect-video rounded-2xl overflow-hidden bg-slate-200 ring-1 ring-slate-200/50 shadow-sm shrink-0 mb-1">
          <img
            src={publicImageUrl}
            alt="Context"
            className="w-full h-full object-contain"
          />
        </div>
      )}

      {/* The Anchor text + Character */}
      <div className="flex items-start gap-4 px-2 py-2">
        <CharacterPortrait character={character} />
        <SpeechBubble text={session.anchor_text} />
      </div>

      {/* Optional Context Setting Text */}
      {session.context_setting && (
        <div className="text-center text-[13.5px] font-bold text-slate-500 px-4 mt-2">
          {session.context_setting}
        </div>
      )}

      <HintPanel session={session} onOpen={onOpenHint} />

      {/* The Sentence Board */}
      <div className="mt-2">
        <SentenceCanvas
          layout={session.layout}
          placements={placements}
          onUndo={onUndo}
          disabled={disabled}
        />
      </div>

      {/* Spacer so the bank sticks to the bottom if there's room */}
      <div className="flex-1" />

      {/* The Bank */}
      <TileBank
        tiles={session.tiles}
        placements={placements}
        onPlace={onPlace}
        disabled={disabled}
      />
    </div>
  );
}
