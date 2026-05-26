import Image from "next/image";

export function ChevronLeft({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function ChevronRight({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function Check({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function XMark({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function Clock({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function Trophy({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 01-10 0V4z"/>
      <path d="M7 6H3v2a3 3 0 003 3"/>
      <path d="M17 6h4v2a3 3 0 01-3 3"/>
      <path d="M9 17h6M12 12v5M10 21h4"/>
    </svg>
  );
}

export function User({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

export function Bolt({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

export function Flag({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
      <line x1="4" y1="22" x2="4" y2="15"/>
    </svg>
  );
}

export function Search({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

export function Football({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
      <polygon points="12,7 14.5,9.5 13.5,12.5 10.5,12.5 9.5,9.5" strokeWidth="1.5"/>
    </svg>
  );
}

export function Gamepad({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="12" rx="5"/>
      <path d="M7 11v4M5 13h4"/>
      <circle cx="17" cy="12" r="1" fill="currentColor"/>
      <circle cx="15" cy="14" r="1" fill="currentColor"/>
    </svg>
  );
}

export function Basketball({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M4.9 4.9c3.1 3.1 3.1 8.1 0 11.2M19.1 4.9c-3.1 3.1-3.1 8.1 0 11.2"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
    </svg>
  );
}

const SPORT_ICONS: Record<string, { dark: string; light: string }> = {
  football: { dark: "/football-white.png", light: "/football-black.png" },
  nba:      { dark: "/basketball-white.png", light: "/basketball-black.png" },
  cs2:      { dark: "/counter-strike-white.png", light: "/counter-strike-black.png" },
};

export function SportIcon({ sport, size = 22 }: { sport: string; size?: number }) {
  const icon = SPORT_ICONS[sport];
  if (!icon) return <Trophy size={size} />;
  if (icon.dark === icon.light) {
    return <Image src={icon.dark} alt={sport} width={size} height={size} style={{ objectFit: "contain" }} />;
  }
  return (
    <>
      <Image src={icon.dark}  alt={sport} width={size} height={size} style={{ objectFit: "contain" }} className="theme-dark-only" />
      <Image src={icon.light} alt={sport} width={size} height={size} style={{ objectFit: "contain" }} className="theme-light-only" />
    </>
  );
}

export function Medal({ rank, size = 22 }: { rank: 1 | 2 | 3; size?: number }) {
  const colors: Record<number, string> = { 1: "#F5C842", 2: "#B0B8C8", 3: "#D4845A" };
  const color = colors[rank];
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="7" stroke={color} strokeWidth="1.8"/>
      <path d="M8.5 4.5l1.5 3h4l1.5-3" stroke={color} strokeWidth="1.8"/>
      <text x="12" y="17.5" textAnchor="middle" fontSize="8" fontWeight="700" fill={color} stroke="none">{rank}</text>
    </svg>
  );
}
