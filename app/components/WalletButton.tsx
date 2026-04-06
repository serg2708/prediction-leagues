"use client";
import { useState, useEffect, useRef } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useConnectors,
} from "wagmi";
import styles from "./WalletButton.module.css";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect }              = useConnect();
  const { disconnect }           = useDisconnect();
  const connectors               = useConnectors();
  const [open, setOpen]          = useState(false);
  const [copied, setCopied]      = useState(false);
  const ref                      = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function copyAddr() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (isConnected && address) {
    return (
      <div ref={ref} style={{ position: "relative" }}>
        <button
          type="button"
          className={styles.connectedBtn}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={styles.dot} />
          {shortAddr(address)}
        </button>
        {open && (
          <div className={styles.dropdown}>
            <button type="button" className={styles.dropItem} onClick={copyAddr}>
              {copied ? "Copied!" : "Copy address"}
            </button>
            <button
              type="button"
              className={`${styles.dropItem} ${styles.dropItemRed}`}
              onClick={() => { disconnect(); setOpen(false); }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  // filter: skip duplicate injected entries and hidden/internal connectors
  const visible = connectors.filter(
    (c) => c.id !== "com.coinbase.wallet" || !connectors.some((x) => x.id !== "com.coinbase.wallet" && x.name === "Coinbase Wallet")
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className={styles.connectBtn}
        onClick={() => setOpen((o) => !o)}
      >
        Connect Wallet
      </button>
      {open && (
        <div className={styles.modal}>
          <div className={styles.modalTitle}>Connect a wallet</div>
          <div className={styles.list}>
            {visible.map((c) => (
              <button
                key={c.uid}
                type="button"
                className={styles.walletRow}
                onClick={() => { connect({ connector: c }); setOpen(false); }}
              >
                {c.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" className={styles.walletIcon} />
                )}
                <span className={styles.walletName}>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
