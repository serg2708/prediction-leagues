"use client";
import type { League, Match } from "@/lib/types";
import type { LeagueWithStats } from "@/lib/hooks/useLeagues";
import { ChevronRight, SportIcon, Trophy } from "./Icons";
import styles from "./LeagueCard.module.css";

function formatEndsAt(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 1) return `${days}d left`;
  if (days === 1) return `1d ${hours}h left`;
  return `${hours}h left`;
}

function formatMatchTime(match: Match): string {
  if (match.status === "live")     return "LIVE";
  if (match.status === "finished") return "FT";
  const d    = new Date(match.starts_at);
  const now  = new Date();
  const diffH = Math.floor((d.getTime() - now.getTime()) / 3600000);
  return diffH > 0 && diffH < 24
    ? `In ${diffH}h`
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function LeagueCard({ league, onView }: { league: LeagueWithStats; onView: (id: string) => void }) {
  const isLeading = league.myRank === 1;
  const m = league.nextMatch;

  return (
    <div className={`${styles.card} ${isLeading ? styles.cardWon : ""}`}>
      <div className={styles.top}>
        <span className={`${styles.sportTile} ${styles[league.sport] ?? ""}`}>
          <SportIcon sport={league.sport} size={20} />
        </span>
        <div className={styles.info}>
          <div className={styles.nameRow}>
            <span className={styles.name}>{league.name}</span>
          </div>
          {m && (
            <div className={`${styles.status} ${m.status === "live" ? styles.statusLive : ""}`}>
              {m.status === "live" && <span className={styles.liveDot} />}
              <span className={styles.statusLabel}>{formatMatchTime(m)}</span>
              <span className={styles.statusText}>{m.team_home} vs {m.team_away}</span>
            </div>
          )}
        </div>
        <div className={styles.pool}>
          <p className={`${styles.poolAmount} num`}>${league.pool_usdc}</p>
          <p className={styles.poolLabel}>Pool</p>
        </div>
      </div>
      <div className={styles.bottom}>
        <div className={styles.rankBlock}>
          {isLeading && (
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={styles.rankTrophy}>
              <path d="M7 4h10v4a5 5 0 11-10 0V4zM7 6H3v2a3 3 0 003 3M17 6h4v2a3 3 0 01-3 3M9 17h6M12 12v5M10 21h4"/>
            </svg>
          )}
          <span className={`${styles.rank} ${isLeading ? styles.rankFirst : ""}`}>
            #{league.myRank}
          </span>
          <span className={styles.rankSub}>of {league.totalMembers}</span>
        </div>
        <div className={styles.divider} />
        <div className={styles.pointsBlock}>
          <span className={`${styles.pointsValue} num`}>{league.myPoints}</span>
          <span className={styles.pointsLabel}>pts</span>
        </div>
        {league.ends_at && (
          <span className={styles.endsAt}>{formatEndsAt(league.ends_at)}</span>
        )}
        <button type="button" className={styles.cta} onClick={() => onView(league.id)}>
          View <ChevronRight />
        </button>
      </div>
    </div>
  );
}

export function DiscoverCard({
  league,
  onJoin,
}: {
  league: League & { members_count?: number };
  onJoin: (code: string) => void;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <span className={`${styles.sportTile} ${styles[league.sport] ?? ""}`}>
          <SportIcon sport={league.sport} size={20} />
        </span>
        <div className={styles.info}>
          <div className={styles.nameRow}>
            <span className={styles.name}>{league.name}</span>
          </div>
          <div className={styles.status}>
            <span className={styles.statusLabel}>{league.sport.toUpperCase()}</span>
            <span className={styles.statusText}>{league.status}</span>
            {league.members_count !== undefined && (
              <span className={styles.statusText}>
                · {league.members_count} player{league.members_count !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className={styles.pool}>
          <p className={`${styles.poolAmount} num`}>${league.pool_usdc}</p>
          <p className={styles.poolLabel}>Pool</p>
        </div>
      </div>
      <div className={styles.bottom}>
        <span className={styles.rankSub}>Entry: ${league.entry_fee_usdc} USDC</span>
        <button
          type="button"
          className={`${styles.cta} ${styles.ctaJoin}`}
          onClick={() => onJoin(league.invite_code)}
        >
          Join <ChevronRight />
        </button>
      </div>
    </div>
  );
}

export function FinishedCard({ league, onView }: { league: LeagueWithStats; onView: (id: string) => void }) {
  const won = league.myRank === 1;
  return (
    <div className={`${styles.card} ${styles.cardFinished}`}>
      <div className={styles.top}>
        <span className={`${styles.sportTile} ${styles[league.sport] ?? ""}`}>
          <SportIcon sport={league.sport} size={20} />
        </span>
        <div className={styles.info}>
          <div className={styles.nameRow}>
            <span className={styles.name}>{league.name}</span>
          </div>
          <span className={styles.finishedBadge}>Finished</span>
        </div>
        <div className={styles.pool}>
          <p className={`${styles.poolAmount} num`}>${league.pool_usdc}</p>
          <p className={styles.poolLabel}>Pool</p>
        </div>
      </div>
      <div className={styles.bottom}>
        <div className={styles.rankBlock}>
          {won && <span className={styles.rankTrophy}><Trophy size={14} /></span>}
          <span className={`${styles.rank} ${won ? styles.rankFirst : ""}`}>
            {won ? "#1" : `#${league.myRank}`}
          </span>
          <span className={styles.rankSub}>of {league.totalMembers}</span>
        </div>
        <div className={styles.divider} />
        <div className={styles.pointsBlock}>
          <span className={`${styles.pointsValue} num`}>{league.myPoints}</span>
          <span className={styles.pointsLabel}>pts</span>
        </div>
        <button type="button" className={styles.cta} onClick={() => onView(league.id)}>
          View <ChevronRight />
        </button>
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return <div className={styles.skeleton} />;
}
