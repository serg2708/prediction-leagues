"use client";
import { useDiscoverLeagues } from "@/lib/hooks/useDiscoverLeagues";
import { useLeagues } from "@/lib/hooks/useLeagues";
import { useProfile } from "@/lib/hooks/useProfile";
import type { Sport } from "@/lib/types";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { DiscoverCard, FinishedCard, LeagueCard, SkeletonCard } from "./components/LeagueCard";
import { Bolt, Flag, Search, Trophy } from "./components/Icons";
import { ThemeToggle } from "./components/ThemeToggle";
import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { profileId } = useProfile();
  const { leagues, loading } = useLeagues(profileId ?? undefined);
  const { leagues: discover, loading: discoverLoading } = useDiscoverLeagues(profileId ?? undefined);
  const [tab, setTab] = useState<"my" | "live" | "discover" | "finished">("my");
  const [discoverQ, setDiscoverQ] = useState("");
  const [discoverSport, setDiscoverSport] = useState<Sport | "all">("all");
  const [discoverSort, setDiscoverSort] = useState<"new" | "pool" | "players">("new");

  const discoverFiltered = useMemo(() => {
    const q = discoverQ.trim().toLowerCase();
    const filtered = discover.filter(
      (l) =>
        (discoverSport === "all" || l.sport === discoverSport) &&
        (q === "" || l.name.toLowerCase().includes(q))
    );
    if (discoverSort === "pool")    return [...filtered].sort((a, b) => Number(b.pool_usdc) - Number(a.pool_usdc));
    if (discoverSort === "players") return [...filtered].sort((a, b) => b.members_count - a.members_count);
    return filtered; // already newest-first from the hook
  }, [discover, discoverQ, discoverSport, discoverSort]);

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  const activeLeagues   = leagues.filter((l) => l.status !== "finished");
  const finishedLeagues = leagues.filter((l) => l.status === "finished");
  const liveLeagues    = activeLeagues.filter((l) => l.nextMatch?.status === "live");
  const liveCount      = liveLeagues.length;
  const totalPool      = activeLeagues.reduce((s, l) => s + Number(l.pool_usdc), 0);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <Image src="/logo.png" alt="logo" width={100} height={100} className={styles.logo} />
          <h1 className={styles.appName}>Prediction Leagues</h1>
        </div>
        <ThemeToggle />
      </header>

      {/* Hero banner */}
      <div className={styles.hero}>
        <div className={styles.heroBanner}>
          <div className={styles.heroTop}>
            <div>
              <p className={styles.heroLabel}>Locked in pools</p>
              <div className={styles.heroAmount}>
                <span className={`${styles.heroPool} num`}>
                  {loading ? "—" : totalPool.toFixed(2)}
                </span>
                <span className={styles.heroUnit}>USDC</span>
              </div>
              <div className={styles.heroMeta}>
                {liveCount > 0 && (
                  <span className={styles.heroChip}>
                    <span className={styles.heroDot} />
                    {liveCount} live
                  </span>
                )}
                <span className={styles.heroAcross}>
                  across {loading ? "—" : activeLeagues.length} league{activeLeagues.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
            <button
              type="button"
              className={styles.heroNewBtn}
              onClick={() => router.push("/leagues/create")}
            >
              + New
            </button>
          </div>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === "my" ? styles.tabActive : ""}`}
          onClick={() => setTab("my")}
        >
          Active {!loading && activeLeagues.length > 0 && activeLeagues.length}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "live" ? styles.tabActive : ""}`}
          onClick={() => setTab("live")}
        >
          <span className={`${styles.tabDot} ${liveCount > 0 ? styles.tabDotLive : ""}`} />
          Live
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "discover" ? styles.tabActive : ""}`}
          onClick={() => setTab("discover")}
        >
          Discover {!discoverLoading && discover.length > 0 && discover.length}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "finished" ? styles.tabActive : ""}`}
          onClick={() => setTab("finished")}
        >
          Finished {!loading && finishedLeagues.length > 0 && finishedLeagues.length}
        </button>
      </div>

      <div className={styles.feed}>
        {tab === "live" ? (
          loading ? (
            [1, 2].map((n) => <SkeletonCard key={n} />)
          ) : liveLeagues.length === 0 ? (
            <div className={styles.empty}>
              <Bolt size={32} />
              <p>No live leagues right now</p>
              <p className={styles.emptyHint}>Check back when matches are in progress</p>
            </div>
          ) : (
            liveLeagues.map((league) => (
              <LeagueCard
                key={league.id}
                league={league}
                onView={(id) => router.push(`/leagues/${id}`)}
              />
            ))
          )
        ) : tab === "my" ? (
          loading ? (
            [1, 2, 3].map((n) => <SkeletonCard key={n} />)
          ) : activeLeagues.length === 0 ? (
            <div className={styles.empty}>
              <Trophy size={32} />
              <p>No leagues yet</p>
              <p className={styles.emptyHint}>Create one or enter an invite code</p>
            </div>
          ) : (
            activeLeagues.map((league) => (
              <LeagueCard
                key={league.id}
                league={league}
                onView={(id) => router.push(`/leagues/${id}`)}
              />
            ))
          )
        ) : tab === "finished" ? (
          loading ? (
            [1, 2].map((n) => <SkeletonCard key={n} />)
          ) : finishedLeagues.length === 0 ? (
            <div className={styles.empty}>
              <Flag size={32} />
              <p>No finished leagues yet</p>
            </div>
          ) : (
            finishedLeagues.map((league) => (
              <FinishedCard
                key={league.id}
                league={league}
                onView={(id) => router.push(`/leagues/${id}`)}
              />
            ))
          )
        ) : (
          <>
            <div className={styles.discoverControls}>
              <input
                className={styles.discoverSearch}
                type="search"
                placeholder="Search leagues…"
                value={discoverQ}
                onChange={(e) => setDiscoverQ(e.target.value)}
              />
              <div className={styles.discoverChipsRow}>
                <div className={styles.discoverChips}>
                  {(["all", "football", "cs2", "nba"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`${styles.discoverChip} ${discoverSport === s ? styles.discoverChipActive : ""}`}
                      onClick={() => setDiscoverSport(s)}
                    >
                      {s === "all" ? "All" : s.toUpperCase()}
                    </button>
                  ))}
                </div>
                <select
                  className={styles.discoverSort}
                  value={discoverSort}
                  onChange={(e) => setDiscoverSort(e.target.value as "new" | "pool" | "players")}
                >
                  <option value="new">Newest</option>
                  <option value="pool">Biggest pool</option>
                  <option value="players">Most players</option>
                </select>
              </div>
            </div>

            {discoverLoading ? (
              [1, 2].map((n) => <SkeletonCard key={n} />)
            ) : discoverFiltered.length === 0 ? (
              <div className={styles.empty}>
                <Search size={32} />
                <p>{discover.length === 0 ? "No open leagues" : "Nothing matches your filters"}</p>
                <p className={styles.emptyHint}>
                  {discover.length === 0 ? "Be the first to create one!" : "Try a different sport or search"}
                </p>
              </div>
            ) : (
              discoverFiltered.map((league) => (
                <DiscoverCard
                  key={league.id}
                  league={league}
                  onJoin={(code) => router.push(`/leagues/join?code=${code}`)}
                />
              ))
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
