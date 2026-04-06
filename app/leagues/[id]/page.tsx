"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useLeague } from "@/lib/hooks/useLeague";
import { usePredictions } from "@/lib/hooks/usePredictions";
import { useProfile } from "@/lib/hooks/useProfile";
import type { Match, LeagueMember, PredictionOutcome } from "@/lib/types";
import styles from "./page.module.css";

const SPORT_EMOJI: Record<string, string> = {
  football: "⚽",
  cs2: "🎮",
  nba: "🏀",
};

const OUTCOME_LABEL: Record<PredictionOutcome, string> = {
  home:  "Home",
  draw:  "Draw",
  away:  "Away",
  team1: "Team 1",
  team2: "Team 2",
};

function sportOutcomes(sport: string): PredictionOutcome[] {
  if (sport === "cs2")      return ["team1", "team2"];
  if (sport === "football") return ["home", "draw", "away"];
  return ["home", "away"];
}

function formatMatchTime(startsAt: string, status: string): string {
  if (status === "live") return "LIVE";
  if (status === "finished") return "Finished";
  const d = new Date(startsAt);
  const now = new Date();
  const diffH = Math.floor((d.getTime() - now.getTime()) / 3600000);
  if (diffH > 0 && diffH < 24) return `In ${diffH}h`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MatchCard({
  match,
  myPrediction,
  onPredict,
  locked: lockedByParent,
}: {
  match: Match;
  myPrediction?: PredictionOutcome;
  onPredict: (matchId: string, outcome: PredictionOutcome) => void;
  locked?: boolean;
}) {

  const locked = match.status !== "upcoming" || !!lockedByParent;

  return (
    <div className={styles.matchCard}>
      <div className={styles.matchHeader}>
        <span
          className={
            match.status === "live"
              ? styles.matchTimeLive
              : match.status === "finished"
              ? styles.matchTimeFinished
              : styles.matchTime
          }
        >
          {match.status === "live" && <span className={styles.liveDot} />}
          {formatMatchTime(match.starts_at, match.status)}
        </span>
        {match.status === "finished" && match.score_home !== undefined && (
          <span className={styles.score}>
            {match.score_home} – {match.score_away}
          </span>
        )}
      </div>

      <div className={styles.teams}>
        <span className={styles.team}>{match.team_home}</span>
        <span className={styles.vs}>vs</span>
        <span className={styles.team}>{match.team_away}</span>
      </div>

      <div className={styles.outcomes}>
        {sportOutcomes(match.sport).map((outcome) => {
            const label = OUTCOME_LABEL[outcome];
            const isSelected = myPrediction === outcome;
            const isCorrect = match.result === outcome && locked;
            const isWrong = isSelected && locked && match.result !== outcome;
            return (
              <button
                key={outcome}
                type="button"
                disabled={locked}
                onClick={() => onPredict(match.id, outcome)}
                className={[
                  styles.outcomeBtn,
                  isSelected ? styles.outcomeBtnSelected : "",
                  isCorrect ? styles.outcomeBtnCorrect : "",
                  isWrong ? styles.outcomeBtnWrong : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {label}
                {isCorrect && isSelected && " +10"}
              </button>
            );
          })}
      </div>
    </div>
  );
}

function MemberRow({ member, index }: { member: LeagueMember; index: number }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className={styles.memberRow}>
      <span className={styles.memberRank}>{index < 3 ? medals[index] : `#${index + 1}`}</span>
      <span className={styles.memberName}>
        {member.profile?.display_name ?? member.profile_id.slice(0, 8)}
      </span>
      <span className={styles.memberPoints}>{member.points} pts</span>
    </div>
  );
}

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { profileId } = useProfile();
  const { league, matches, members, loading } = useLeague(id);
  const { predictions, predict } = usePredictions(id, profileId ?? undefined);
  const [activeTab, setActiveTab] = useState<"matches" | "standings" | "history">("matches");

  const share = useCallback(() => {
    if (!league) return;
    const url  = `${process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"}/leagues/join?code=${league.invite_code}`;
    const text = `Join my league "${league.name}" on Prediction Leagues! 🏆`;
    const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;
    window.open(warpcastUrl, "_blank", "noopener,noreferrer");
  }, [league]);

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <span className={styles.spinner} />
      </div>
    );
  }

  if (!league) {
    return (
      <div className={styles.notFound}>
        <p>League not found</p>
        <button type="button" onClick={() => router.back()}>← Back</button>
      </div>
    );
  }

  const me = members.find((m) => m.profile_id === (profileId ?? "0xYou"));
  const minPlayers = league.min_players ?? 2;
  const waitingForPlayers = members.length < minPlayers;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => router.back()}>←</button>
        <div className={styles.headerInfo}>
          <h1 className={styles.leagueName}>
            {SPORT_EMOJI[league.sport]} {league.name}
          </h1>
          <p className={styles.leagueSub}>
            {members.length} players · ${league.pool_usdc} USDC pool
          </p>
        </div>
        <div className={styles.inviteCode} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div>
            <span className={styles.codeLabel}>Code</span>
            <span className={styles.code}>{league.invite_code}</span>
          </div>
          <button type="button" className={styles.shareBtn} onClick={share} title="Share league">
            Share
          </button>
        </div>
      </header>

      {me && (
        <div className={styles.myStats}>
          <div className={styles.myStat}>
            <p className={styles.myStatValue}>#{me.rank}</p>
            <p className={styles.myStatLabel}>Your rank</p>
          </div>
          <div className={styles.myStatDivider} />
          <div className={styles.myStat}>
            <p className={styles.myStatValue}>{me.points}</p>
            <p className={styles.myStatLabel}>Your points</p>
          </div>
          <div className={styles.myStatDivider} />
          <div className={styles.myStat}>
            <p className={styles.myStatValue}>${league.pool_usdc}</p>
            <p className={styles.myStatLabel}>Prize pool</p>
          </div>
        </div>
      )}

      {waitingForPlayers && (
        <div className={styles.waitingBanner}>
          <span>⏳</span>
          <span>Waiting for {minPlayers - members.length} more player{minPlayers - members.length !== 1 ? "s" : ""} — predictions locked until {minPlayers} have joined</span>
        </div>
      )}

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "matches" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("matches")}
        >
          Matches
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "standings" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("standings")}
        >
          Standings
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "history" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("history")}
        >
          History
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === "matches" && (
          matches.filter((m) => m.status !== "finished").length > 0 ? (
            matches
              .filter((m) => m.status !== "finished")
              .map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  myPrediction={predictions[match.id]?.outcome}
                  onPredict={predict}
                  locked={waitingForPlayers}
                />
              ))
          ) : (
            <p className={styles.empty}>No upcoming matches</p>
          )
        )}

        {activeTab === "standings" && (
          <div className={styles.standings}>
            {members.map((m, i) => (
              <MemberRow key={m.profile_id} member={m} index={i} />
            ))}
          </div>
        )}

        {activeTab === "history" && (
          matches.filter((m) => m.status === "finished").length === 0 ? (
            <p className={styles.empty}>No finished matches yet</p>
          ) : (
            matches
              .filter((m) => m.status === "finished")
              .map((match) => {
                const pred    = predictions[match.id];
                const correct = pred && match.result === pred.outcome;
                return (
                  <div key={match.id} className={styles.historyRow}>
                    <div className={`${styles.historyIcon} ${
                      !pred ? styles.historyNoPred :
                      correct ? styles.historyCorrect : styles.historyWrong
                    }`}>
                      {!pred ? "—" : correct ? "✓" : "✗"}
                    </div>
                    <div className={styles.historyInfo}>
                      <p className={styles.historyMatch}>
                        {match.team_home} vs {match.team_away}
                      </p>
                      <p className={styles.historyMeta}>
                        Result: <strong>{match.result ?? "?"}</strong>
                        {pred && <> · Your pick: <strong>{pred.outcome}</strong></>}
                        {match.score_home != null && (
                          <> · {match.score_home}–{match.score_away}</>
                        )}
                      </p>
                    </div>
                    <span className={correct ? styles.historyPts : styles.historyPtsZero}>
                      {!pred ? "no pick" : correct ? "+10 pts" : "0 pts"}
                    </span>
                  </div>
                );
              })
          )
        )}
      </div>
    </div>
  );
}
