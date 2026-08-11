export default function ChipTile({ text, isPlaced, isSlot, onClick, disabled, mark }) {
  if (isSlot) {
    if (!text) {
      // Empty slot in the canvas
      return (
        <div className="h-8 min-w-[2.25rem] px-2.5 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 flex items-center justify-center transition-colors">
          <span className="opacity-0">___</span>
        </div>
      );
    }
    // Filled slot in the canvas
    let style = "bg-white border-indigo-200 text-indigo-700";
    if (mark === 'green') style = "bg-emerald-50 border-emerald-400 text-emerald-800";
    else if (mark === 'red') style = "bg-rose-50 border-rose-400 text-rose-800";

    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`h-8 min-w-[2.25rem] px-2.5 rounded-lg border-2 font-black shadow-sm active:scale-95 transition flex items-center justify-center ${style}`}
      >
        {text}
      </button>
    );
  }

  // Tile in the bank
  if (isPlaced) {
    // Hidden/ghosted in the bank
    return (
      <div className="h-10 px-3.5 rounded-xl border-2 border-transparent bg-slate-100 flex items-center justify-center opacity-40">
        <span className="font-bold text-slate-400 select-none">{text}</span>
      </div>
    );
  }

  // Available tile in the bank
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-10 px-3.5 rounded-xl bg-white border-2 border-slate-200 shadow-sm font-black text-slate-800 active:scale-95 active:border-indigo-300 active:text-indigo-600 transition flex items-center justify-center hover:border-slate-300"
    >
      {text}
    </button>
  );
}
