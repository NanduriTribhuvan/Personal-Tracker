import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn('size-8', className)}>
      <rect width="32" height="32" rx="8" fill="#0c1218" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" stroke="#34d399" strokeOpacity="0.35" />
      <path d="M7 21.5l5.5-6 4 3.5L25 10" stroke="#34d399" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="10" r="2" fill="#34d399" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">
        Edge<span className="text-primary">Track</span>
      </span>
    </div>
  );
}
