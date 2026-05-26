"use client";
import { useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useRouter } from "next/navigation";
import { useDisconnect } from "wagmi";
import { supabase } from "@/lib/supabase";
import { BottomNav } from "@/app/components/BottomNav";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { ChevronLeft, Check, XMark, Clock, User } from "@/app/components/Icons";
import { useProfile } from "@/lib/hooks/useProfile";
import styles from "./page.module.css";

interface PredictionRow {
  id: string;
  outcome: string;
  points_awarded: number | null;
  created_at: string;
  matches: {
    team_home: string;
    team_away: string;
    starts_at: string;
    status: string;
  };
}

interface Stats {
  totalLeagues:   number;
  totalPoints:    number;
  totalPreds:     number;
  correctPreds:   number;
}

export default function ProfilePage() {
  const router = useRouter();
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { profile, profileId } = useProfile();
  const { disconnect } = useDisconnect();

  const [stats, setStats]       = useState<Stats | null>(null);
  const [preds, setPreds]       = useState<PredictionRow[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  useEffect(() => {
    if (!profileId) { setLoading(false); return; }

    async function load() {
      setLoading(true);

      const [leaguesRes, predsRes] = await Promise.all([
        supabase
          .from("league_members")
          .select("points")
          .eq("profile_id", profileId),
        supabase
          .from("predictions")
          .select("id, outcome, points_awarded, created_at, matches(team_home,team_away,starts_at,status)")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const members  = leaguesRes.data ?? [];
      const predRows = (predsRes.data ?? []) as unknown as PredictionRow[];

      const totalPoints  = members.reduce((s, m) => s + (m.points as number), 0);
      const totalPreds   = predRows.length;
      const correctPreds = predRows.filter((p) => (p.points_awarded ?? 0) > 0).length;

      setStats({
        totalLeagues: members.length,
        totalPoints,
        totalPreds,
        correctPreds,
      });
      setPreds(predRows);
      setLoading(false);
    }

    load();
  }, [profileId]);

  const winRate = stats && stats.totalPreds > 0
    ? Math.round((stats.correctPreds / stats.totalPreds) * 100)
    : 0;

  if (loading) return (
    <div className={styles.container}>
      <div className={styles.loading}><span className={styles.spinner} /></div>
    </div>
  );

  if (!profileId) return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => router.back()}><ChevronLeft /></button>
        <h1 className={styles.title}>Profile</h1>
        <div style={{ marginLeft: "auto" }}><ThemeToggle /></div>
      </header>
      <div className={styles.notConnected}>
        <span style={{ fontSize: 36, color: "var(--fg-muted)" }}><User size={36} /></span>
        <p>Connect your wallet to see your profile</p>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => router.back()}><ChevronLeft /></button>
        <h1 className={styles.title}>Profile</h1>
        <div style={{ marginLeft: "auto" }}><ThemeToggle /></div>
      </header>

      {/* Identity */}
      <div className={styles.identity}>
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="avatar" className={styles.avatar} />
        ) : (
          <div className={styles.avatarPlaceholder}><User size={32} /></div>
        )}
        <p className={styles.displayName}>
          {profile?.display_name ?? profileId.slice(0, 8)}
        </p>
        <p className={styles.address}>
          {profileId.slice(0, 6)}…{profileId.slice(-4)}
        </p>
        <button
          type="button"
          className={styles.disconnectBtn}
          onClick={() => disconnect()}
        >
          Disconnect wallet
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className={styles.statsGrid}>
          <div className={styles.statBox}>
            <span className={`${styles.statValue} ${styles.statBlue}`}>{stats.totalLeagues}</span>
            <span className={styles.statLabel}>Leagues</span>
          </div>
          <div className={styles.statBox}>
            <span className={`${styles.statValue} ${styles.statGold}`}>{stats.totalPoints}</span>
            <span className={styles.statLabel}>Total pts</span>
          </div>
          <div className={styles.statBox}>
            <span className={`${styles.statValue} ${styles.statGreen}`}>{winRate}%</span>
            <span className={styles.statLabel}>Win rate</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statValue}>{stats.correctPreds}/{stats.totalPreds}</span>
            <span className={styles.statLabel}>Correct preds</span>
          </div>
        </div>
      )}

      {/* Prediction history */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Recent predictions</p>
        {preds.length === 0 ? (
          <p className={styles.empty}>No predictions yet</p>
        ) : (
          preds.map((p) => {
            const match = Array.isArray(p.matches) ? p.matches[0] : p.matches;
            const isFinished = match?.status === "finished";
            const correct    = (p.points_awarded ?? 0) > 0;
            return (
              <div key={p.id} className={styles.predRow}>
                <div className={`${styles.predOutcome} ${
                  !isFinished ? styles.predPending :
                  correct     ? styles.predCorrect : styles.predWrong
                }`}>
                  {!isFinished ? <Clock /> : correct ? <Check /> : <XMark />}
                </div>
                <div className={styles.predMatch}>
                  <p className={styles.predMatchName}>
                    {match?.team_home ?? "?"} vs {match?.team_away ?? "?"}
                  </p>
                  <p className={styles.predMatchDate}>
                    {p.outcome.toUpperCase()} ·{" "}
                    {match?.starts_at
                      ? new Date(match.starts_at).toLocaleDateString("en-US", {
                          month: "short", day: "numeric",
                        })
                      : ""}
                  </p>
                </div>
                {isFinished ? (
                  <span className={styles.predPoints}>
                    {correct ? `+${p.points_awarded} pts` : "0 pts"}
                  </span>
                ) : (
                  <span className={styles.predPointsPending}>Pending</span>
                )}
              </div>
            );
          })
        )}
      </div>
      <BottomNav />
    </div>
  );
}
