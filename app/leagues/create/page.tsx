"use client";
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
  type LifecycleStatus,
} from "@coinbase/onchainkit/transaction";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { createLeagueAction } from "@/app/actions/create-league";
import { fetchTournaments, type Tournament } from "@/app/actions/fetch-tournaments";
import { registerLeagueOnChain } from "@/app/actions/register-league-onchain";
import { BottomNav } from "@/app/components/BottomNav";
import { Check, ChevronLeft, ChevronRight, SportIcon } from "@/app/components/Icons";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { buildDepositCalls } from "@/lib/contracts";
import { useProfile } from "@/lib/hooks/useProfile";
import type { Sport } from "@/lib/types";
import styles from "./page.module.css";

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;

const SPORTS: { value: Sport; label: string; desc: string }[] = [
  { value: "football", label: "Football", desc: "Soccer / football matches" },
  { value: "cs2",      label: "CS2",      desc: "Counter-Strike 2 tournaments" },
  { value: "nba",      label: "NBA",      desc: "Basketball games" },
];

const ENTRY_FEES = [5, 10, 20, 50, 100];

type Step = 1 | 2 | 3 | 4;

interface FormState {
  name: string;
  sport: Sport | "";
  competitionId: string;
  competitionName: string;
  entryFee: number;
  isPublic: boolean;
  minPlayers: number;
}

export default function CreateLeaguePage() {
  const router = useRouter();
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { profileId } = useProfile();

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>({
    name: "", sport: "", competitionId: "", competitionName: "",
    entryFee: 10, isPublic: true, minPlayers: 2,
  });
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tourLoading, setTourLoading] = useState(false);
  const [leagueUuid] = useState(() => crypto.randomUUID());
  const [registering, setRegistering]   = useState(false);
  const [registered, setRegistered]     = useState(false);
  const [registeredFee, setRegisteredFee] = useState<number>(form.entryFee);
  const [regError, setRegError]         = useState<string | null>(null);

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  // Fetch tournaments when sport is chosen and we advance to step 3
  useEffect(() => {
    if (step === 3 && form.sport) {
      setTourLoading(true);
      fetchTournaments(form.sport)
        .then(setTournaments)
        .finally(() => setTourLoading(false));
    }
  }, [step, form.sport]);

  function canAdvance(): boolean {
    if (step === 1) return form.name.trim().length >= 3;
    if (step === 2) return form.sport !== "";
    if (step === 3) return form.competitionId !== "";
    return true;
  }

  function next() {
    if (canAdvance() && step < 4) setStep((s) => (s + 1) as Step);
  }

  const handleTxStatus = useCallback(
    async (status: LifecycleStatus) => {
      if (status.statusName !== "success") return;
      const txHash = status.statusData.transactionReceipts[0]?.transactionHash;

      if (!USE_MOCK && profileId && txHash) {
        const finalId = await createLeagueAction({
          leagueUuid,
          name: form.name.trim(),
          sport: form.sport as Sport,
          competitionId: form.competitionId,
          entryFee: registeredFee,
          isPublic: form.isPublic,
          minPlayers: form.minPlayers,
          profileId,
          txHash,
        });
        router.push(`/leagues/${finalId}`);
      } else {
        router.push("/");
      }
    },
    [leagueUuid, profileId, form, registeredFee, router]
  );

  // Use the fee that was locked in at registration time, not the current form value
  const depositCalls = step === 4 && registered ? buildDepositCalls(leagueUuid, registeredFee) : [];

  async function handleRegister() {
    const fee = form.entryFee; // snapshot before any async state changes
    setRegistering(true);
    setRegError(null);
    const res = await registerLeagueOnChain(leagueUuid, fee);
    setRegistering(false);
    if (res.ok) {
      setRegisteredFee(fee);
      setRegistered(true);
    } else {
      setRegError(res.error ?? "Registration failed");
    }
  }
  const stepLabels = ["Name", "Sport", "Tournament", "Entry Fee"];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => router.back()}><ChevronLeft /></button>
        <h1 className={styles.title}>Create League</h1>
        <div style={{ marginLeft: "auto" }}><ThemeToggle /></div>
      </header>

      {/* Progress */}
      <div className={styles.progress}>
        {stepLabels.map((label, i) => (
          <div
            key={label}
            className={`${styles.progressSegment} ${
              i + 1 < step ? styles.progressDone : i + 1 === step ? styles.progressActive : ""
            }`}
          />
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
                  onClick={() => setForm((f) => ({ ...f, sport: s.value, competitionId: "", competitionName: "" }))}
                >
                  <span className={styles.sportEmoji} data-sport={s.value}><SportIcon sport={s.value} size={22} /></span>
                  <div>
                    <span className={styles.sportLabel}>{s.label}</span>
                    <span className={styles.sportDesc}>{s.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Tournament */}
        {step === 3 && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>
              {form.sport === "football" ? "Choose a competition" : form.sport === "nba" ? "Choose a season" : "Choose a tournament"}
            </h2>
            <p className={styles.stepDesc}>
              {form.sport === "football"
                ? "Predictions are scored across the full competition"
                : form.sport === "nba"
                ? "Predictions are scored across the season"
                : "League ends when the tournament finishes"}
            </p>
            {tourLoading ? (
              <div className={styles.tourLoading}>
                <div className={styles.spinner} />
              </div>
            ) : tournaments.length === 0 ? (
              <p className={styles.tourEmpty}>No tournaments available right now</p>
            ) : (
              <div className={styles.tourList}>
                {tournaments.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.tourRow} ${form.competitionId === t.id ? styles.tourRowActive : ""}`}
                    onClick={() => setForm((f) => ({ ...f, competitionId: t.id, competitionName: t.name }))}
                  >
                    <div className={styles.tourInfo}>
                      <div className={styles.tourName}>{t.name}</div>
                      {t.meta && <div className={styles.tourMeta}>{t.meta}</div>}
                    </div>
                    {form.competitionId === t.id && <span className={styles.tourCheck}><Check size={13} /></span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4 — Entry Fee + Deposit */}
        {step === 4 && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Set entry fee</h2>
            <p className={styles.stepDesc}>Each player pays this to join · winner takes all</p>
            <div className={styles.feeGrid}>
              {ENTRY_FEES.map((fee) => (
                <button
                  key={fee}
                  type="button"
                  disabled={registered}
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
                  <SportIcon sport={form.sport} size={16} />{" "}
                  {SPORTS.find((s) => s.value === form.sport)?.label}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span>Tournament</span>
                <span>{form.competitionName}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Entry to pool</span>
                <span>${form.entryFee} USDC</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Platform fee (5%)</span>
                <span>${(form.entryFee * 0.05).toFixed(2)} USDC</span>
              </div>
              <div className={styles.summaryRow}>
                <span>You pay</span>
                <span className={styles.summaryHighlight}>${(form.entryFee * 1.05).toFixed(2)} USDC</span>
              </div>
            </div>

            <div className={styles.txWrapper}>
              {!registered ? (
                <>
                  <button
                    type="button"
                    className={`${styles.txBtn} ${registering ? styles.ctaDisabled : ""}`}
                    disabled={registering}
                    onClick={handleRegister}
                  >
                    {registering ? "Registering on-chain…" : "Create League"}
                  </button>
                  {regError && <p className={styles.regError}>{regError}</p>}
                </>
              ) : (
                <Transaction
                  chainId={Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532)}
                  calls={depositCalls}
                  onStatus={handleTxStatus}
                  onError={(e) => console.error("tx error", e)}
                >
                  <TransactionButton
                    text={`Deposit $${form.entryFee} USDC & Join`}
                    className={styles.txBtn}
                  />
                  <TransactionStatus>
                    <TransactionStatusAction />
                  </TransactionStatus>
                </Transaction>
              )}
            </div>
          </div>
        )}
      </div>

      {step < 4 && (
        <div className={styles.footer}>
          <button
            type="button"
            className={`${styles.cta} ${!canAdvance() ? styles.ctaDisabled : ""}`}
            onClick={next}
            disabled={!canAdvance()}
          >
            Continue <ChevronRight />
          </button>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
