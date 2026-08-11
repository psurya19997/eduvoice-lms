import { useEffect, useState, useMemo } from 'react';
import SentenceCanvas from './SentenceCanvas.jsx';
import TileBank from './TileBank.jsx';
import HintPanel from './HintPanel.jsx';
import { supabase } from '../../../lib/supabase.js';

export default function FlashBody({ session, placements, onPlace, onUndo, disabled, onOpenHint }) {
  const flashMs = session.flash_duration_ms || 3000;
  const initialSeconds = Math.ceil(flashMs / 1000);
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [isFlashing, setIsFlashing] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);

  // If there's an image, get its public URL
  const publicImageUrl = useMemo(() => {
    if (!session?.image_url) return null;
    const { data } = supabase.storage.from('game-assets').getPublicUrl(session.image_url);
    return data.publicUrl;
  }, [session?.image_url]);

  // Reset image load state if URL changes
  useEffect(() => {
    setImageLoaded(!publicImageUrl);
  }, [publicImageUrl]);

  // Target sentence text for flashing
  const flashText = useMemo(() => {
    if (!session?.valid_sentences?.[0]) return '';
    // Format spacing nicely for punctuation
    return session.valid_sentences[0]
      .join(' ')
      .replace(/\s+([.,!?])/g, '$1'); 
  }, [session?.valid_sentences]);

  // Countdown timer
  useEffect(() => {
    if (!imageLoaded) return; // Don't start timer until image loads

    if (timeLeft <= 0) {
      setIsFlashing(false);
      return;
    }
    const t = setTimeout(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [timeLeft, imageLoaded]);

  // Re-arm timer if session changes
  useEffect(() => {
    const s = Math.ceil((session.flash_duration_ms || 3000) / 1000);
    setTimeLeft(s);
    setIsFlashing(true);
  }, [session?.id, session.flash_duration_ms]);

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3">
      {/* Context Image with Flash Timer */}
      {publicImageUrl && (
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-200 ring-1 ring-slate-200/50 shadow-sm shrink-0">
          <img
            src={publicImageUrl}
            alt="Context"
            onLoad={() => setImageLoaded(true)}
            className="w-full h-full object-contain"
          />
          {isFlashing && (
            <div className="absolute top-2 right-2 bg-rose-500/90 backdrop-blur-md text-white font-black text-[13px] px-3 py-1 rounded-full shadow-sm tabular-nums">
              {timeLeft}s
            </div>
          )}
        </div>
      )}

      {/* Optional Context Setting Text */}
      {session.context_setting && (
        <div className="text-center text-[13.5px] font-bold text-slate-500 px-4">
          {session.context_setting}
        </div>
      )}

      {/* Flashing Text Display */}
      {isFlashing && flashText && (
        <div className="bg-amber-100 border-2 border-amber-300 rounded-2xl p-4 text-center shadow-inner animate-pulse mx-4 mt-2">
          <div className="text-[20px] font-black text-amber-900">{flashText}</div>
          <div className="text-xs font-bold text-amber-700 uppercase tracking-widest mt-1">Memorize this!</div>
        </div>
      )}

      <HintPanel session={session} onOpen={onOpenHint} />

      {/* The Sentence Board */}
      <SentenceCanvas
        layout={session.layout}
        placements={placements}
        onUndo={onUndo}
        disabled={disabled || isFlashing} // Optionally lock canvas while flashing
      />

      {/* Spacer so the bank sticks to the bottom if there's room */}
      <div className="flex-1" />

      {/* The Bank */}
      <TileBank
        tiles={session.tiles}
        placements={placements}
        onPlace={onPlace}
        disabled={disabled || isFlashing} // Optionally lock bank while flashing
      />
    </div>
  );
}
