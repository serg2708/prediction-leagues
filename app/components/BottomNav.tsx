"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAccount, useConnect, useConnectors } from "wagmi";
import styles from "./BottomNav.module.css";

function IconHome() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

function IconBrowse() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconRanks() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 01-10 0V4z"/>
      <path d="M7 6H3v2a3 3 0 003 3"/>
      <path d="M17 6h4v2a3 3 0 01-3 3"/>
      <path d="M9 17h6M12 12v5M10 21h4"/>
    </svg>
  );
}

function IconProfile() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

const TABS = [
  { href: "/",               Icon: IconHome,   label: "Home"   },
  { href: "/leagues/join",   Icon: IconBrowse, label: "Browse" },
  { href: "/leagues/create", Icon: IconPlus,   label: "Create", accent: true },
  { href: "/leaderboard",    Icon: IconRanks,  label: "Ranks"  },
];

function MeTab() {
  const pathname   = usePathname();
  const router     = useRouter();
  const { address, isConnected } = useAccount();
  const { connect }  = useConnect();
  const connectors = useConnectors();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isActive = pathname === "/profile";

  if (isConnected && address) {
    return (
      <div ref={ref} className={styles.meWrap}>
        <button
          type="button"
          className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
          onClick={() => router.push("/profile")}
        >
          <span className={styles.meIconWrap}>
            <IconProfile />
            <span className={styles.meDot} />
          </span>
          <span className={styles.label}>Profile</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className={styles.meWrap}>
      <button
        type="button"
        className={`${styles.tab} ${open ? styles.tabActive : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <IconProfile />
        <span className={styles.label}>Profile</span>
      </button>

      {open && (
        <div className={styles.connectMenu}>
          <p className={styles.connectTitle}>Connect wallet</p>
          {connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              className={styles.connectItem}
              onClick={() => { connect({ connector: c }); setOpen(false); }}
            >
              {c.icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.icon} alt="" className={styles.connectIcon} />
              )}
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav}>
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`${styles.tab} ${pathname === tab.href ? styles.tabActive : ""}`}
        >
          {tab.accent
            ? <span className={styles.createIcon}><tab.Icon /></span>
            : <span className={styles.icon}><tab.Icon /></span>
          }
          <span className={styles.label}>{tab.label}</span>
        </Link>
      ))}
      <MeTab />
    </nav>
  );
}
