export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <svg
        width="30"
        height="30"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="36" height="36" rx="10" className="fill-emerald-600 dark:fill-emerald-500" />
        <path
          d="M18 8.5C13.85 10.6 10.5 11.4 10.5 16.5C10.5 22.1 14.3 25.8 18 27.5C21.7 25.8 25.5 22.1 25.5 16.5C25.5 11.4 22.15 10.6 18 8.5Z"
          className="fill-white/20 stroke-white"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M13.5 18H16L17.4 14.5L19.2 21.5L20.5 18H22.5"
          stroke="white"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
        MediGuide AI
      </span>
    </span>
  );
}
