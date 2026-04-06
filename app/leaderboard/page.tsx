"use client";
import { useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

interface LeaderboardEntry {
  profile_id:   string;
  display_name: string;
  avatar_url:   string | null;
  total_points: number;
  leagues:      number;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Fetch all members with profile info
      const { data } = await supabase
        .from("league_members")
        .select("profile_id, points, profiles(display_name, avatar_url)");

      if (!data) { setLoading(false); return; }

      // Aggregate by profile_id
      const map = new Map<string, LeaderboardEntry>();
      for (const row of data) {
        const pid = row.profile_id as string;
        const pts = (row.points as number) ?? 0;
        const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        if (!map.has(pid)) {
          map.set(pid, {
            profile_id:   pid,
            display_name: (prof as { display_name?: string } | null)?.display_name ?? pid.slice(0, 8),
            avatar_url:   (prof as { avatar_url?: string | null } | null)?.avatar_url ?? null,
            total_points: pts,
            leagues:      1,
          });
        } else {
          const e = map.get(pid)!;
          e.total_points += pts;
          e.leagues      += 1;
        }
      }

      const sorted = [...map.values()].sort((a, b) => b.total_points - a.total_points);
      setEntries(sorted);
      setLoading(false);
    }
    load();
  }, []);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const medals = ["🥇", "🥈", "🥉"];
  const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;
  const podiumClasses = top3.length === 3
    ? [styles.podiumSecond, styles.podiumFirst, styles.podiumThird]
    : [styles.podiumFirst, styles.podiumSecond, styles.podiumThird];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => router.back()}>←</button>
        <h1 className={styles.title}>Global Leaderboard</h1>
      </header>

      {loading ? (
        <div className={styles.loading}><span className={styles.spinner} /></div>
      ) : entries.length === 0 ? (
        <p className={styles.empty}>No players yet</p>
      ) : (
        <>
          {/* Top 3 podium */}
          {top3.length > 0 && (
            <div className={styles.podium}>
              {podiumOrder.map((entry, i) => {
                const origIndex = top3.indexOf(entry);
                return (
                  <div key={entry.profile_id} className={`${styles.podiumItem} ${podiumClasses[i]}`}>
                    <div className={styles.podiumAvatar}>
                      {entry.avatar_url
                        ? <img src={entry.avatar_url} alt={entry.display_name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                        : "👤"
                      }
                    </div>
                    <span className={styles.podiumMedal}>{medals[origIndex]}</span>
                    <span className={styles.podiumName}>{entry.display_name}</span>
                    <span className={styles.podiumPts}>{entry.total_points} pts</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Rest of leaderboard */}
          <div className={styles.list}>
            {rest.map((entry, i) => (
              <div key={entry.profile_id} className={styles.row}>
                <span className={styles.rowRank}>#{i + 4}</span>
                <div className={styles.rowAvatar}>
                  {entry.avatar_url
                    ? <img src={entry.avatar_url} alt={entry.display_name} />
                    : "👤"
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className={styles.rowName}>{entry.display_name}</p>
                  <p className={styles.rowMeta}>{entry.leagues} league{entry.leagues !== 1 ? "s" : ""}</p>
                </div>
                <span className={styles.rowPoints}>{entry.total_points} pts</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
