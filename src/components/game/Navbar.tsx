'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Address } from 'viem';

interface NavbarProps {
  address: Address;
  status: 'setup' | 'live';
  dbBalance: string;
  channelBalance?: string;
  totalBets?: number;
  isProcessing?: boolean;
  onEndSession?: () => void;
  onLogoClick?: () => void;
  onDisconnect?: () => void;
}

export default function Navbar({
  address,
  status,
  dbBalance,
  channelBalance,
  totalBets,
  isProcessing,
  onEndSession,
  onLogoClick,
  onDisconnect,
}: NavbarProps) {
  const router = useRouter();
  const [walletOpen, setWalletOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setWalletOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="navbar">
      <div className="navbar-accent-top" />

      <div className="navbar-content">
        {/* Left: Logo + Status */}
        <div className="navbar-left">
          <button
            onClick={onLogoClick ?? (() => router.push('/'))}
            className="navbar-logo-btn"
          >
            <span className="navbar-logo">おみくじ</span>
            <span className="navbar-version">v0.1</span>
          </button>

          {/* Status indicator */}
          <div className={status === 'live' ? 'navbar-status-live' : 'navbar-status-setup'}>
            <span className="navbar-status-dot" />
            {status === 'live' ? 'LIVE' : 'SETUP'}
          </div>
        </div>

        {/* Right: Stats + Wallet */}
        <div className="navbar-right">
          {/* Balance */}
          <div className="navbar-stat navbar-stat-purple">
            <span className="navbar-stat-label">{status === 'live' ? 'BAL' : 'BAL'}</span>
            <span className="navbar-stat-value">${dbBalance}</span>
          </div>

          {/* Channel Balance */}
          {status === 'live' && channelBalance && (
            <div className="navbar-stat navbar-stat-mint">
              <span className="navbar-stat-label">CH</span>
              <span className="navbar-stat-value">${channelBalance}</span>
            </div>
          )}

          {/* Total Bets */}
          {status === 'live' && totalBets !== undefined && (
            <div className="navbar-stat navbar-stat-purple">
              <span className="navbar-stat-label">BETS</span>
              <span className="navbar-stat-value">{totalBets}</span>
            </div>
          )}

          {/* End Session */}
          {status === 'live' && onEndSession && (
            <button
              onClick={onEndSession}
              disabled={isProcessing}
              className="navbar-end-btn"
            >
              [END]
            </button>
          )}

          {/* Separator */}
          <div className="navbar-separator" />

          {/* Wallet dropdown */}
          <div ref={dropdownRef} className="navbar-wallet-container">
            <button
              onClick={() => setWalletOpen(!walletOpen)}
              className={walletOpen ? 'navbar-wallet-btn navbar-wallet-btn-open' : 'navbar-wallet-btn'}
            >
              <span className="navbar-wallet-dot" />
              {address.slice(0, 6)}...{address.slice(-4)}
              <span className={walletOpen ? 'navbar-wallet-arrow navbar-wallet-arrow-open' : 'navbar-wallet-arrow'}>
                ▼
              </span>
            </button>

            {/* Dropdown */}
            {walletOpen && (
              <div className="navbar-dropdown">
                {/* Address full */}
                <div className="navbar-dropdown-header">
                  <div className="navbar-dropdown-label">CONNECTED WALLET</div>
                  <div className="navbar-dropdown-address">{address}</div>
                </div>

                {/* Copy address */}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(address);
                    setWalletOpen(false);
                  }}
                  className="navbar-dropdown-item"
                >
                  {'>'} Copy Address
                </button>

                {/* Disconnect */}
                {onDisconnect && (
                  <button
                    onClick={() => {
                      setWalletOpen(false);
                      onDisconnect();
                    }}
                    className="navbar-dropdown-item navbar-dropdown-disconnect"
                  >
                    {'>'} Disconnect Wallet
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="navbar-accent-bottom" />
    </nav>
  );
}
