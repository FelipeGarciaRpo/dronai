import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2 text-ink">
      <svg viewBox="0 0 32 32" className="size-5.5" aria-hidden>
        <circle cx="16" cy="16" r="10.5" fill="none" stroke="currentColor" strokeWidth="4" />
        <circle cx="26.5" cy="8" r="3.2" fill="#f59e0b" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.01em]">DronAI</span>
    </Link>
  );
}
