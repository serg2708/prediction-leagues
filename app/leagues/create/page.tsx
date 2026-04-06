"use client";
import { useCallback, useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
} from "@coinbase/onchainkit/transaction";
import type { LifecycleStatus } from "@coinbase/onchainkit/transaction";
import { useRouter } from "next/navigation";
import { buildCreateLeagueCalls } from "@/lib/contracts";
import { useProfile } from "@/lib/hooks/useProfile";
import { supabase } from "@/lib/supabase";
import type { Sport } from "@/lib/types";
import styles from "./page.module.css";

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;

const SPORTS: { value: Sport; label: string; emoji: string; desc: string }[] = [
  { value: "football", label: "Football", emoji: "⚽", desc: "Soccer / football matches" },
  { value: "cs2",      label: "CS2",      emoji: "🎮", desc: "Counter-Strike 2 tournaments" },
  { value: "nba",      label: "NBA",      emoji: "🏀", desc: "Basketball games" },
];

const ENTRY_FEES = [5, 10, 20, 50, 100];

type Step = 1 | 2 | 3;

interface FormState {
  name: string;
  sport: Sport | "";
  entryFee: number;
  isPublic: boolean;
  minPlayers: number;
}

export default function CreateLeaguePage() {
  const router = useRouter();
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { profileId } = useProfile();

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>({ name: "", sport: "", entryFee: 10, isPublic: true, minPlayers: 2 });
  const [createdLeagueId, setCreatedLeagueId] = useState<string | null>(null);

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  function canAdvance(): boolean {
    if (step === 1) return form.name.trim().length >= 3;
    if (step === 2) return form.sport !== "";
    return true;
  }

  function next() {
    if (canAdvance() && step < 3) setStep((s) => (s + 1) as Step);
  }

  /** Create the league row in Supabase (before deposit confirms) */
  const createLeagueRecord = useCallback(async (): Promise<string | null> => {
    if (USE_MOCK || !profileId) return "mock-league-id";
    const { data, error } = await supabase
      .from("leagues")
      .insert({
        name: form.name.trim(),
        sport: form.sport,
        entry_fee_usdc: form.entryFee,
        pool_usdc: form.entryFee,
        creator_id: profileId,
        is_public: form.isPublic,
        min_players: form.minPlayers,
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return data.id as string;
  }, [form, profileId]);

  /** Called by OnchainKit when the tx succeeds */
  const handleTxStatus = useCallback(
    async (status: LifecycleStatus) => {
      if (status.statusName !== "success") return;
      const txHash = status.statusData.transactionReceipts[0]?.transactionHash;

      // Record deposit + add creator as first member
      if (!USE_MOCK && createdLeagueId && profileId && txHash) {
        await Promise.all([
          supabase.from("deposits").insert({
            league_id: createdLeagueId,
            profile_id: profileId,
            amount_usdc: form.entryFee,
            tx_hash: txHash,
            confirmed: true,
          }),
          supabase.from("league_members").insert({
            league_id: createdLeagueId,
            profile_id: profileId,
            paid: true,
          }),
        ]);
      }

      router.push(createdLeagueId ? `/leagues/${createdLeagueId}` : "/");
    },
    [createdLeagueId, profileId, form.entryFee, router]
  );

  // Pre-create league row as soon as user reaches step 3
  useEffect(() => {
    if (step === 3 && !createdLeagueId) {
      createLeagueRecord().then(setCreatedLeagueId);
    }
  }, [step, createdLeagueId, createLeagueRecord]);

  // Three-step: createLeague → approve USDC → deposit
  const depositCalls = createdLeagueId
    ? buildCreateLeagueCalls(createdLeagueId, form.entryFee)
    : [];
  const stepLabels = ["Name", "Sport", "Entry Fee"];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => router.back()}>←</button>
        <h1 className={styles.title}>Create League</h1>
      </header>

      {/* Progress */}
      <div className={styles.progress}>
        {stepLabels.map((label, i) => (
          <div key={label} className={styles.progressItem}>
            <div
              className={`${styles.progressDot} ${
                i + 1 < step ? styles.progressDone : i + 1 === step ? styles.progressActive : ""
              }`}
            >
              {i + 1 < step ? "✓" : i + 1}
            </div>
            <span className={`${styles.progressLabel} ${i + 1 === step ? styles.progressLabelActive : ""}`}>
              {label}
            </span>
            {i < stepLabels.length - 1 && (
              <div className={`${styles.progressLine} ${i + 1 < step ? styles.progressLineDone : ""}`} />
            )}
          </div>
        ))}
      </div>

      <div className={styles.body}>
        {/* Step 1 — Name */}
        {step === 1 && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Name your league</h2>
            <p className={styles.stepDesc}>Pick something your friends will recognise</p>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. Alpha Squad"
              maxLength={32}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <span className={styles.charCount}>{form.name.length}/32</span>

            <div className={styles.toggleRow}>
              <div>
                <p className={styles.toggleLabel}>Public league</p>
                <p className={styles.toggleDesc}>Visible in Discover for anyone to join</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.isPublic}
                className={`${styles.toggle} ${form.isPublic ? styles.toggleOn : ""}`}
                onClick={() => setForm((f) => ({ ...f, isPublic: !f.isPublic }))}
              />
            </div>
          </div>
        )}

        {/* Step 2 — Sport */}
        {step === 2 && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Choose a sport</h2>
            <p className={styles.stepDesc}>Predictions are tailored per sport</p>
            <div className={styles.sportGrid}>
              {SPORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`${styles.sportCard} ${form.sport === s.value ? styles.sportCardActive : ""}`}
                  onClick={() => setForm((f) => ({ ...f, sport: s.value }))}
                >
                  <span className={styles.sportEmoji}>{s.emoji}</span>
                  <div>
                    <span className={styles.sportLabel}>{s.label}</span>
                    <span className={styles.sportDesc}>{s.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Entry Fee + Deposit */}
        {step === 3 && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Set entry fee</h2>
            <p className={styles.stepDesc}>Each player pays this to join · winner takes all</p>
            <div className={styles.feeGrid}>
              {ENTRY_FEES.map((fee) => (
                <button
                  key={fee}
                  type="button"
                  className={`${styles.feeBtn} ${form.entryFee === fee ? styles.feeBtnActive : ""}`}
                  onClick={() => setForm((f) => ({ ...f, entryFee: fee }))}
                >
                  ${fee}
                </button>
              ))}
            </div>

            <div className={styles.minPlayersRow}>
              <span className={styles.minPlayersLabel}>Min players to start</span>
              <div className={styles.minPlayersBtns}>
                {[2, 3, 4, 5, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`${styles.minBtn} ${form.minPlayers === n ? styles.minBtnActive : ""}`}
                    onClick={() => setForm((f) => ({ ...f, minPlayers: n }))}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span>League name</span>
                <span>{form.name}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Sport</span>
                <span>
                  {SPORTS.find((s) => s.value === form.sport)?.emoji}{" "}
                  {SPORTS.find((s) => s.value === form.sport)?.label}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span>Your deposit</span>
                <span className={styles.summaryHighlight}>${form.entryFee} USDC</span>
              </div>
            </div>

            {/* USDC Transaction via OnchainKit */}
            <div className={styles.txWrapper}>
              <Transaction
                chainId={Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532)}
                calls={depositCalls}
                onStatus={handleTxStatus}
                onError={(e) => console.error("tx error", e)}
              >
                <TransactionButton
                  text={`Deposit $${form.entryFee} USDC & Create`}
                  className={styles.txBtn}
                  disabled={!createdLeagueId}
                />
                <TransactionStatus>
                  <TransactionStatusAction />
                </TransactionStatus>
              </Transaction>
            </div>
          </div>
        )}
      </div>

      {/* Footer — only shown on steps 1 & 2 */}
      {step < 3 && (
        <div className={styles.footer}>
          <button
            type="button"
            className={`${styles.cta} ${!canAdvance() ? styles.ctaDisabled : ""}`}
            onClick={next}
            disabled={!canAdvance()}
          >
            Continue →
          </button>
        </div>
      )}
    </div>
  );
}
