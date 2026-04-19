/**
 * PhoneFrame — wraps every route in a mobile-sized viewport.
 *
 * On phones: fills the whole screen (pure mobile app feel).
 * On desktop: centers a phone-shaped frame so we can preview during dev.
 */
export default function PhoneFrame({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center sm:p-6">
      <div
        className="
          relative
          w-full h-screen
          sm:w-[400px] sm:h-[812px]
          sm:rounded-[40px]
          sm:shadow-2xl
          sm:ring-1 sm:ring-slate-200
          bg-white
          overflow-hidden
        "
      >
        {children}
      </div>
    </div>
  );
}
