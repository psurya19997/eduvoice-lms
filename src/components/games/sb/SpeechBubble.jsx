export default function SpeechBubble({ text }) {
  if (!text) return null;
  return (
    <div className="relative bg-white rounded-3xl p-4 shadow-sm ring-1 ring-slate-200/60 max-w-[240px]">
      <div className="text-[15px] font-black text-slate-800 leading-snug">
        {text}
      </div>
      {/* Speech bubble tail pointing left toward the character */}
      <div className="absolute top-5 -left-2 w-4 h-4 bg-white border-l border-b border-slate-200/60 transform rotate-45" />
    </div>
  );
}
