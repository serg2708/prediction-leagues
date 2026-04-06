"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
} from "@coinbase/onchainkit/transaction";
import type { LifecycleStatus } from "@coinbase/onchainkit/transaction";
import { useRouter, useSearchParams } from "next/navigation";
import { buildDepositCalls } from "@/lib/contracts";
import { useProfile } from "@/lib/hooks/useProfile";
import { MOCK_LEAGUES } from "@/lib/mock";
import { supabase } from "@/lib/supabase";
import type { League } from "@/lib/types";
import styles from "./page.module.css";

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;
const SPORT_EMOJI: Record<string, string> = { football: "⚽", cs2: "🎮", nba: "🏀" };

type LookupState = "idle" | "searching" | "found" | "not_found" | "already_member";

function JoinLeagueContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { profileId } = useProfile();

  const [code, setCode] = useState(params.get("code")?.toUpperCase() ?? "");
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [league, setLeague] = useState<League | null>(null);
  const autoSearched = useRef(false);

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  const handleSearch = useCallback(
    async (searchCode = code) => {
      const trimmed = searchCode.trim().toUpperCase();
      if (trimmed.length < 4) return;
      setLookupState("searching");
      setLeague(null);

      if (USE_MOCK) {
        const found = MOCK_LEAGUES.find((l) => l.invite_code === trimmed);
        setLeague(found ?? null);
        setLookupState(found ? "found" : "not_found");
        return;
      }

      const { data } = await supabase
        .from("leagues")
        .select("*, league_members(profile_id)")
        .eq("invite_code", trimmed)
        .single();

      if (!data) {
        setLookupState("not_found");
        return;
      }

      const members = (data.league_members ?? []) as { profile_id: string }[];
      if (profileId && members.some((m) => m.profile_id === profileId)) {
        setLeague(data as League);
        setLookupState("already_member");
        return;
      }

      setLeague(data as League);
      setLookupState("found");
    },
    [code, profileId]
  );

  // Auto-search once when a code arrives via URL query param
  useEffect(() => {
    if (autoSearched.current) return;
    const urlCode = params.get("code")?.toUpperCase();
    if (urlCode && urlCode.length >= 4) {
      autoSearched.current = true;
      handleSearch(urlCode);
    }
  }, [handleSearch, params]);

  const handleTxStatus = useCallback(
    async (status: LifecycleStatus) => {
      if (status.statusName !== "success" || !league) return;
      const txHash = status.statusData.transactionReceipts[0]?.transactionHash;

      if (!USE_MOCK && profileId && txHash) {
        await Promise.all([
          supabase.from("deposits").insert({
            league_id: league.id,
            profile_id: profileId,
            amount_usdc: league.entry_fee_usdc,
            tx_hash: txHash,
            confirmed: true,
          }),
          supabase.from("league_members").insert({
            league_id: league.id,
            profile_id: profileId,
            paid: true,
          }),
        ]);
      }

      router.push(`/leagues/${league.id}`);
    },
    [league, profileId, router]
  );

  const depositCalls = league ? buildDepositCalls(league.id, league.entry_fee_usdc) : [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => router.back()}>
          ←
        </button>
        <h1 className={styles.title}>Join League</h1>
      </header>

      <div className={styles.body}>
        <p className={styles.hint}>Enter the invite code shared by the league creator</p>

        <div className={styles.inputRow}>
          <input
            className={styles.codeInput}
            type="text"
            placeholder="e.g. ALPHA1"
            maxLength={8}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setLookupState("idle");
              setLeague(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button
            type="button"
            className={`${styles.searchBtn} ${lookupState === "searching" ? styles.searchBtnLoading : ""}`}
            onClick={() => handleSearch()}
            disabled={lookupState === "searching" || code.trim().length < 4}
          >
            {lookupState === "searching" ? "…" : "Search"}
          </button>
        </div>

        {lookupState === "not_found" && (
          <p className={styles.errorMsg}>
            No league found for code <strong>{code}</strong>
          </p>
        )}

        {lookupState === "already_member" && league && (
          <div className={styles.alreadyCard}>
            <p>
              You&apos;re already in <strong>{league.name}</strong>
            </p>
            <button
              type="button"
              className={styles.goBtn}
              onClick={() => router.push(`/leagues/${league.id}`)}
            >
              Go to league →
            </button>
          </div>
        )}

        {lookupState === "found" && league && depositCalls.length > 0 && (
          <div className={styles.leagueCard}>
            <div className={styles.leagueTop}>
              <span className={styles.sportEmoji}>{SPORT_EMOJI[league.sport]}</span>
              <div>
                <p className={styles.leagueName}>{league.name}</p>
                <p className={styles.leagueMeta}>
                  {league.sport.toUpperCase()} · ${league.pool_usdc} pool
                </p>
              </div>
            </div>

            <div className={styles.feeRow}>
              <span className={styles.feeLabel}>Entry fee</span>
              <span className={styles.feeValue}>${league.entry_fee_usdc} USDC</span>
            </div>

            <div className={styles.txWrapper}>
              <Transaction
                chainId={Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532)}
                calls={depositCalls}
                onStatus={handleTxStatus}
                onError={(e) => console.error("tx error", e)}
              >
                <TransactionButton
                  text={`Pay $${league.entry_fee_usdc} USDC & Join`}
                  className={styles.txBtn}
                />
                <TransactionStatus>
                  <TransactionStatusAction />
                </TransactionStatus>
              </Transaction>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function JoinLeaguePage() {
  return (
    <Suspense fallback={<div className={styles.container} />}>
      <JoinLeagueContent />
    </Suspense>
  );
}
