"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { leaveLeagueAction } from "@/app/actions/leave-league";
import { useLeague } from "@/lib/hooks/useLeague";
import { usePredictions } from "@/lib/hooks/usePredictions";
import { useProfile } from "@/lib/hooks/useProfile";
import { type MemberStats, useStandingsStats } from "@/lib/hooks/useStandingsStats";
import type { Match, LeagueMember, PredictionOutcome } from "@/lib/types";
import { ChevronLeft, ChevronRight, Check, XMark, Clock, SportIcon, Medal } from "@/app/components/Icons";
import matchStyles from "@/app/components/MatchCard.module.css";
import styles from "./page.module.css";


function outcomeLabel(outcome: PredictionOutcome, match: Match): string {
  if (outcome === "home"  || outcome === "team1") return match.team_home;
  if (outcome === "away"  || outcome === "team2") return match.team_away;
  return "Draw";
}

function sportOutcomes(sport: string): PredictionOutcome[] {
  // NBA uses team1/team2 — must match what update-results/admin record,
  // otherwise predictions never compare equal to results
  if (sport === "cs2" || sport === "nba") return ["team1", "team2"];
  if (sport === "football") return ["home", "draw", "away"];
  return ["team1", "team2"];
}

function formatMatchTime(startsAt: string, status: string): string {
  if (status === "live") return "LIVE";
  if (status === "finished") return "Finished";
  if (status === "abandoned") return "Voided";
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
  onPredict: (matchId: string, outcome: PredictionOutcome, matchStatus: string) => void;
  locked?: boolean;
}) {

  const locked = match.status !== "upcoming" || !!lockedByParent;

  return (
    <div className={`${matchStyles.card} ${match.status === "live" ? matchStyles.cardLive : ""}`}>
      <div className={matchStyles.header}>
        <span
          className={[
            matchStyles.pill,
            match.status === "live"     ? matchStyles.pillLive     : "",
            match.status === "finished" ? matchStyles.pillFinished  : "",
          ].filter(Boolean).join(" ")}
        >
          {formatMatchTime(match.starts_at, match.status)}
        </span>
        {match.status === "finished" && match.score_home !== undefined && (
          <span className={`${matchStyles.score} num`}>
            {match.score_home} – {match.score_away}
          </span>
        )}
        {match.status === "live" && match.score_home !== undefined && (
          <span className={`${matchStyles.score} ${matchStyles.scoreLive} num`}>
            {match.score_home} – {match.score_away}
          </span>
        )}
      </div>

      <div className={matchStyles.teamRow}>
        <div className={matchStyles.teamBlock}>
          <div className={matchStyles.teamCrest}>{match.team_home.slice(0, 3).toUpperCase()}</div>
          <span className={matchStyles.teamName}>{match.team_home}</span>
        </div>
        <span className={matchStyles.vsLabel}>VS</span>
        <div className={`${matchStyles.teamBlock} ${matchStyles.teamBlockRight}`}>
          <span className={matchStyles.teamName}>{match.team_away}</span>
          <div className={matchStyles.teamCrest}>{match.team_away.slice(0, 3).toUpperCase()}</div>
        </div>
      </div>

      <div className={matchStyles.outcomes}>
        {sportOutcomes(match.sport).map((outcome) => {
          const label = outcomeLabel(outcome, match);
          const isSelected = myPrediction === outcome;
          // Only mark correct/wrong when a result actually exists — a locked
          // match without a result (live/abandoned) must not paint picks red
          const isCorrect  = !!match.result && match.result === outcome && locked;
          const isWrong    = isSelected && locked && !!match.result && match.result !== outcome;
          return (
            <button
              key={outcome}
              type="button"
              disabled={locked}
              onClick={() => onPredict(match.id, outcome, match.status)}
              className={[
                matchStyles.outcome,
                isSelected ? matchStyles.outcomeSelected : "",
                isCorrect  ? matchStyles.outcomeCorrect  : "",
                isWrong    ? matchStyles.outcomeWrong    : "",
              ].filter(Boolean).join(" ")}
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

function MemberRow({
  member,
  index,
  isMe,
  stats,
}: {
  member: LeagueMember;
  index: number;
  isMe?: boolean;
  stats?: MemberStats;
}) {
  const name = member.profile?.display_name ?? member.profile_id.slice(0, 8);
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className={`${styles.memberRow} ${isMe ? styles.memberRowMe : ""}`}>
      <span className={styles.memberRank}>
        {index < 3 ? <Medal rank={(index + 1) as 1 | 2 | 3} size={20} /> : `#${index + 1}`}
      </span>
      <div className={`${styles.memberAvatar} ${isMe ? styles.memberAvatarMe : ""}`}>{initials}</div>
      <div className={styles.memberNameCol}>
        <div className={styles.memberNameBlock}>
          <span className={styles.memberName}>{name}</span>
          {isMe && <span className={styles.memberYouBadge}>You</span>}
          {stats && stats.streak >= 2 && (
            <span className={styles.streakBadge} title={`${stats.streak} correct in a row`}>
              🔥{stats.streak}
            </span>
          )}
        </div>
        {stats && stats.total > 0 && (
          <div className={styles.memberStatsRow}>
            <span className={styles.formDots}>
              {stats.form.map((ok, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: order is the identity here
                  key={i}
                  className={`${styles.formDot} ${ok ? styles.formDotOk : styles.formDotBad}`}
                />
              ))}
            </span>
            <span className={styles.memberAccuracy}>
              {stats.correct}/{stats.total} correct
            </span>
          </div>
        )}
      </div>
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
  const standingsStats = useStandingsStats(id, matches);
  const [activeTab, setActiveTab] = useState<"matches" | "standings" | "history">("matches");
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveErr, setLeaveErr] = useState<string | null>(null);

  const leaveLeague = useCallback(async () => {
    if (!league) return;
    if (!confirm(`Leave "${league.name}"? Your $${league.entry_fee_usdc} entry is refunded (the 5% platform fee is not).`)) return;
    setLeaving(true);
    setLeaveErr(null);
    const res = await leaveLeagueAction(league.id);
    setLeaving(false);
    if (res.ok) router.push("/");
    else setLeaveErr(res.error ?? "Failed to leave");
  }, [league, router]);

  const share = useCallback(async () => {
    if (!league) return;
    const url  = `${process.env.NEXT_PUBLIC_URL ?? "https://prediction-leagues.vercel.app"}/leagues/join?code=${league.invite_code}`;
    const text = `Join my league "${league.name}" on Prediction Leagues!`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: league.name, text, url });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
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
        <button type="button" onClick={() => router.back()}><ChevronLeft size={16} /> Back</button>
      </div>
    );
  }

  const me = members.find((m) => m.profile_id === (profileId ?? "0xYou"));
  const minPlayers = league.min_players ?? 2;
  const waitingForPlayers = members.length < minPlayers;

  // Predictable = still open. Voided (abandoned) matches move to History, not
  // the Matches tab, so they don't masquerade as predictable.
  const openMatches    = matches.filter((m) => m.status === "upcoming" || m.status === "live");
  const pastMatches    = matches.filter((m) => m.status === "finished" || m.status === "abandoned");
  const hasPredictable = matches.some((m) => m.status === "upcoming");

  // Self-exit window: before anything has kicked off, while the league is
  // still pending. Server re-checks authoritatively in leaveLeagueAction.
  const now = Date.now();
  const canLeave =
    !!me &&
    league.status === "pending" &&
    pastMatches.length === 0 &&
    !matches.some((m) => m.status === "live" || new Date(m.starts_at).getTime() <= now);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => router.back()}><ChevronLeft /></button>
        <div className={styles.headerInfo}>
          <h1 className={styles.leagueName}>
            <SportIcon sport={league.sport} size={18} /> {league.name}
          </h1>
          <p className={styles.leagueSub}>
            {members.length} players · ${league.pool_usdc} USDC pool
          </p>
        </div>
        <div className={styles.inviteCode} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div>
            <span className={styles.codeLabel}>Code </span>
            <span className={styles.code}>{league.invite_code}</span>
          </div>
          <button type="button" className={styles.shareBtn} onClick={share} title="Share league">
            {copied ? "Copied!" : "Share"}
          </button>
        </div>
      </header>

      {me && (
        <div className={styles.statsCard}>
          <div className={styles.statCol}>
            <p className={styles.myStatLabel}>Pool</p>
            <div className={styles.statValRow}>
              <span className={`${styles.myStatValue} ${styles.statValAccent} num`}>{league.pool_usdc}</span>
              <span className={styles.statUnit}>USDC</span>
            </div>
          </div>
          <div className={styles.myStatDivider} />
          <div className={styles.statCol}>
            <p className={styles.myStatLabel}>Your rank</p>
            <div className={styles.statValRow}>
              {me.rank === 1 && (
                <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={styles.statValGold} style={{ flexShrink: 0 }}>
                  <path d="M7 4h10v4a5 5 0 11-10 0V4zM7 6H3v2a3 3 0 003 3M17 6h4v2a3 3 0 01-3 3M9 17h6M12 12v5M10 21h4"/>
                </svg>
              )}
              <span className={`${styles.myStatValue} ${me.rank === 1 ? styles.statValGold : ""} num`}>
                #{me.rank}
              </span>
              <span className={styles.statUnit}>of {members.length}</span>
            </div>
          </div>
          <div className={styles.myStatDivider} />
          <div className={`${styles.statCol} ${styles.statColFlex}`}>
            <p className={styles.myStatLabel}>Points</p>
            <div className={styles.statValRow}>
              <span className={`${styles.myStatValue} num`}>{me.points}</span>
            </div>
          </div>
        </div>
      )}

      {waitingForPlayers && (
        <div className={styles.waitingBanner}>
          <Clock size={16} />
          <span>Waiting for {minPlayers - members.length} more player{minPlayers - members.length !== 1 ? "s" : ""} — predictions locked until {minPlayers} have joined</span>
        </div>
      )}

      {canLeave && (
        <div className={styles.leaveRow}>
          <button
            type="button"
            className={styles.leaveBtn}
            disabled={leaving}
            onClick={leaveLeague}
          >
            {leaving ? "Leaving…" : "Leave league & get refund"}
          </button>
          {leaveErr && <span className={styles.leaveErr}>{leaveErr}</span>}
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

      {hasPredictable && !waitingForPlayers && activeTab !== "matches" && (
        <div className={styles.floatingCta}>
          <button
            type="button"
            className={styles.predictBtn}
            onClick={() => setActiveTab("matches")}
          >
            Make Predictions <ChevronRight size={16} />
          </button>
        </div>
      )}

      <div className={styles.content}>
        {activeTab === "matches" && (
          openMatches.length > 0 ? (
            openMatches.map((match) => (
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
              <MemberRow
                key={m.profile_id}
                member={m}
                index={i}
                isMe={!!profileId && m.profile_id === profileId}
                stats={standingsStats[m.profile_id]}
              />
            ))}
          </div>
        )}

        {activeTab === "history" && (
          pastMatches.length === 0 ? (
            <p className={styles.empty}>No finished matches yet</p>
          ) : (
            pastMatches.map((match) => {
              const voided  = match.status === "abandoned";
              const pred    = predictions[match.id];
              const correct = !voided && pred && match.result === pred.outcome;
              return (
                <div key={match.id} className={styles.historyRow}>
                  <div className={`${styles.historyIcon} ${
                    voided ? styles.historyNoPred :
                    !pred ? styles.historyNoPred :
                    correct ? styles.historyCorrect : styles.historyWrong
                  }`}>
                    {voided ? "—" : !pred ? "—" : correct ? <Check /> : <XMark />}
                  </div>
                  <div className={styles.historyInfo}>
                    <p className={styles.historyMatch}>
                      {match.team_home} vs {match.team_away}
                    </p>
                    <p className={styles.historyMeta}>
                      {voided ? (
                        <em>Voided — no result</em>
                      ) : (
                        <>
                          Result: <strong>{match.result ? outcomeLabel(match.result, match) : "?"}</strong>
                          {pred && <> · Your pick: <strong>{outcomeLabel(pred.outcome, match)}</strong></>}
                          {match.score_home != null && (
                            <> · {match.score_home}–{match.score_away}</>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  <span className={correct ? styles.historyPts : styles.historyPtsZero}>
                    {voided ? "voided" : !pred ? "no pick" : correct ? "+10 pts" : "0 pts"}
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
