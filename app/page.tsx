"use client";
import { useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { WalletButton } from "./components/WalletButton";
import { useRouter } from "next/navigation";
import { useLeagues } from "@/lib/hooks/useLeagues";
import { useDiscoverLeagues } from "@/lib/hooks/useDiscoverLeagues";
import { useProfile } from "@/lib/hooks/useProfile";
import type { League, Match } from "@/lib/types";
import type { LeagueWithStats } from "@/lib/hooks/useLeagues";
import styles from "./page.module.css";

const SPORT_EMOJI: Record<string, string> = { football: "⚽", cs2: "🎮", nba: "🏀" };

function formatMatchBadge(match: Match): { label: string; status: Match["status"] } {
  if (match.status === "live")     return { label: `LIVE · ${match.team_home} vs ${match.team_away}`, status: "live" };
  if (match.status === "finished") return { label: `Finished · ${match.team_home} vs ${match.team_away}`, status: "finished" };
  const d = new Date(match.starts_at);
  const now = new Date();
  const diffH = Math.floor((d.getTime() - now.getTime()) / 3600000);
  const time = diffH > 0 && diffH < 24
    ? `In ${diffH}h`
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return { label: `${time} · ${match.team_home} vs ${match.team_away}`, status: "upcoming" };
}

function MatchBadge({ match }: { match: Match }) {
  const { label, status } = formatMatchBadge(match);
  if (status === "live") return (
    <span className={styles.badgeLive}><span className={styles.liveDot} />{label}</span>
  );
  if (status === "finished") return <span className={styles.badgeFinished}>{label}</span>;
  return <span className={styles.badgeUpcoming}>{label}</span>;
}

function LeagueCard({ league, onView }: { league: LeagueWithStats; onView: (id: string) => void }) {
  const isLeading = league.myRank === 1;
  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <div className={styles.cardLeft}>
          <span className={styles.sportEmoji}>{SPORT_EMOJI[league.sport]}</span>
          <div>
            <p className={styles.leagueName}>{league.name}</p>
            {league.nextMatch && <MatchBadge match={league.nextMatch} />}
          </div>
        </div>
        <div className={styles.pool}>
          <p className={styles.poolAmount}>${league.pool_usdc}</p>
          <p className={styles.poolLabel}>USDC pool</p>
        </div>
      </div>
      <div className={styles.cardBottom}>
        <div className={styles.rankBlock}>
          <span className={`${styles.rank} ${isLeading ? styles.rankFirst : ""}`}>
            #{league.myRank}
          </span>
          <span className={styles.rankSub}>of {league.totalMembers}</span>
        </div>
        <div className={styles.pointsBlock}>
          <span className={styles.pointsValue}>{league.myPoints}</span>
          <span className={styles.pointsLabel}>pts</span>
        </div>
        <button type="button" className={styles.viewBtn} onClick={() => onView(league.id)}>
          View →
        </button>
      </div>
    </div>
  );
}

function DiscoverCard({ league, onJoin }: { league: League; onJoin: (code: string) => void }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <div className={styles.cardLeft}>
          <span className={styles.sportEmoji}>{SPORT_EMOJI[league.sport]}</span>
          <div>
            <p className={styles.leagueName}>{league.name}</p>
            <span className={styles.badgeUpcoming}>
              {league.sport.toUpperCase()} · {league.status}
            </span>
          </div>
        </div>
        <div className={styles.pool}>
          <p className={styles.poolAmount}>${league.pool_usdc}</p>
          <p className={styles.poolLabel}>USDC pool</p>
        </div>
      </div>
      <div className={styles.cardBottom}>
        <span className={styles.rankSub} style={{ marginRight: "auto" }}>
          Entry: ${league.entry_fee_usdc} USDC
        </span>
        <button
          type="button"
          className={styles.viewBtn}
          style={{ background: "#0052ff", borderColor: "#0052ff", color: "#fff" }}
          onClick={() => onJoin(league.invite_code)}
        >
          Join →
        </button>
      </div>
    </div>
  );
}

function SkeletonCard() { return <div className={styles.skeleton} />; }

export default function Home() {
  const router = useRouter();
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { profileId } = useProfile();
  const { leagues, loading } = useLeagues(profileId ?? undefined);
  const { leagues: discover, loading: discoverLoading } = useDiscoverLeagues(profileId ?? undefined);
  const [tab, setTab] = useState<"my" | "discover">("my");

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  const liveCount  = leagues.filter((l) => l.nextMatch?.status === "live").length;
  const totalPool  = leagues.reduce((s, l) => s + Number(l.pool_usdc), 0);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.logo}>⚡</span>
          <h1 className={styles.appName}>Prediction Leagues</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className={styles.viewBtn} onClick={() => router.push("/leaderboard")} title="Leaderboard">🏆</button>
          <button type="button" className={styles.viewBtn} onClick={() => router.push("/profile")} title="Profile">👤</button>
          <WalletButton />
        </div>
      </header>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <p className={styles.statValue}>{loading ? "—" : leagues.length}</p>
          <p className={styles.statLabel}>Active Leagues</p>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <p className={styles.statValue}>{loading ? "—" : `$${totalPool}`}</p>
          <p className={styles.statLabel}>Total Pool</p>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <p className={`${styles.statValue} ${liveCount > 0 ? styles.liveValue : ""}`}>
            {loading ? "—" : liveCount}
          </p>
          <p className={styles.statLabel}>Live Now</p>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === "my" ? styles.tabActive : ""}`}
          onClick={() => setTab("my")}
        >
          My Leagues
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "discover" ? styles.tabActive : ""}`}
          onClick={() => setTab("discover")}
        >
          Discover {!discoverLoading && discover.length > 0 && `(${discover.length})`}
        </button>
      </div>

      <div className={styles.feed}>
        {tab === "my" ? (
          loading ? (
            [1, 2, 3].map((n) => <SkeletonCard key={n} />)
          ) : leagues.length === 0 ? (
            <div className={styles.empty}>
              <p>🏆</p>
              <p>No leagues yet</p>
              <p className={styles.emptyHint}>Create one or enter an invite code</p>
            </div>
          ) : (
            leagues.map((league) => (
              <LeagueCard
                key={league.id}
                league={league}
                onView={(id) => router.push(`/leagues/${id}`)}
              />
            ))
          )
        ) : discoverLoading ? (
          [1, 2].map((n) => <SkeletonCard key={n} />)
        ) : discover.length === 0 ? (
          <div className={styles.empty}>
            <p>🔍</p>
            <p>No open leagues</p>
            <p className={styles.emptyHint}>Be the first to create one!</p>
          </div>
        ) : (
          discover.map((league) => (
            <DiscoverCard
              key={league.id}
              league={league}
              onJoin={(code) => router.push(`/leagues/join?code=${code}`)}
            />
          ))
        )}
      </div>

      <div className={styles.fabRow}>
        <button type="button" className={styles.fabSecondary} onClick={() => router.push("/leagues/join")}>
          Enter Code
        </button>
        <button type="button" className={styles.fab} onClick={() => router.push("/leagues/create")}>
          + Create League
        </button>
      </div>
    </div>
  );
}
