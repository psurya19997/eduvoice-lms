import ChipTile from './ChipTile.jsx';

export default function SentenceCanvas({ layout, placements, onUndo, disabled, slotMarks }) {
  let slotCounter = 0;

  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm ring-1 ring-slate-200 flex flex-wrap gap-x-1.5 gap-y-2 items-center min-h-[80px] content-center text-[15px]">
      {layout.map((cell, idx) => {
        if (cell.type === 'slot') {
          const currentSlotIndex = slotCounter;
          slotCounter += 1;
          const placedText = placements[currentSlotIndex];
          const mark = slotMarks ? slotMarks[currentSlotIndex] : undefined;

          return (
            <ChipTile
              key={`slot-${idx}`}
              text={placedText}
              isSlot={true}
              mark={mark}
              disabled={disabled || !placedText}
              onClick={() => {
                if (placedText && !disabled) {
                  onUndo(currentSlotIndex);
                }
              }}
            />
          );
        }

        if (cell.type === 'locked') {
          return (
            <div
              key={`locked-${idx}`}
              className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 font-extrabold"
            >
              {cell.word}
            </div>
          );
        }

        if (cell.type === 'punct') {
          return (
            <div
              key={`punct-${idx}`}
              className="text-slate-800 font-black -ml-1 text-2xl"
            >
              {cell.word}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
