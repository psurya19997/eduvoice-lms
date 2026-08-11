// Trigger button used by SB mechanic bodies to open the shared HintSheet.
// The sheet (with progressive hint disclosure) lives at the SBSession level.
// Renders nothing when the session has no hints authored.

export default function HintPanel({ session, onOpen }) {
  const hasAnyHint = !!(session?.hint_1 || session?.hint_2);
  if (!hasAnyHint) return null;

  return (
    <div className="px-4 flex flex-col items-center shrink-0">
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 font-bold text-[12px] ring-1 ring-amber-200 active:scale-95 transition"
      >
        💡 Need a hint?
      </button>
    </div>
  );
}
