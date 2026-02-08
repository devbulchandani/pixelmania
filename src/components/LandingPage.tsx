'use client';

import { useRouter } from 'next/navigation';
import { useUserSync } from '@/hooks/useUserSync';
import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi'

export default function LandingPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { userData, isSyncing } = useUserSync();
  const [glitchActive, setGlitchActive] = useState(false);
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()

  useEffect(() => {
    if (isConnected && userData && !isSyncing) {
      console.log('[Landing] User synced, redirecting to game...');
      setGlitchActive(true);
      setTimeout(() => router.push('/game'), 500);
    }
  }, [isConnected, userData, isSyncing, router]);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitchActive(true);
      setTimeout(() => setGlitchActive(false), 200);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="landing-page">
      <div className="landing-scanline" />
      <div className="landing-grid-bg" />
      <div className="landing-orb landing-orb-mint" />
      <div className="landing-orb landing-orb-purple" />

      <nav className="landing-nav">
        <div className="landing-nav-content">
          <div className="landing-nav-logo">おみくじ</div>
          {isSyncing && <div className="landing-nav-sync">[Syncing...]</div>}
        </div>
      </nav>

      <div className="landing-hero">
        <div className="landing-heading-container">
          <h1 className="landing-heading">
            <span className={`landing-heading-text ${glitchActive ? 'landing-heading-text--glitch' : ''}`}>
              PREDICT
              <br />
              <span style={{ color: '#B2FF9E' }}>WIN</span>
              <span style={{ color: '#FFFFFF' }}>.</span>
              <span style={{ color: '#B6A6FF' }}>INSTANT</span>
            </span>
          </h1>
          <div className="landing-corner landing-corner--tl" />
          <div className="landing-corner landing-corner--tr" />
          <div className="landing-corner landing-corner--bl" />
          <div className="landing-corner landing-corner--br" />
        </div>

        <p className="landing-subtitle">
          Fast crypto prediction markets on{' '}
          <span className="landing-subtitle-highlight">Yellow Network</span>
          {' '}// Zero gas // Instant settlement
        </p>

        <div className="landing-connect-group">
          {connectors.map((connector, index) => (
            <button
              key={index}
              onClick={() => connector.connect()}
              disabled={isSyncing}
              className="landing-connect-btn"
            >
              {isSyncing ? '[SYNCING...]' : `[CONNECT ${connector.name.toUpperCase()}]`}
            </button>
          ))}
        </div>

        <div className="landing-features">
          <div className="landing-feature-card landing-feature-card--mint">
            <div className="landing-feature-glow landing-feature-glow--mint" />
            <div className="landing-feature-label landing-feature-label--mint">[01] INSTANT</div>
            <h3 className="landing-feature-title">Gas-Free Betting</h3>
            <p className="landing-feature-desc">
              Place unlimited bets off-chain using Yellow Network state channels. No gas fees, no waiting.
            </p>
          </div>

          <div className="landing-feature-card landing-feature-card--purple">
            <div className="landing-feature-glow landing-feature-glow--purple" />
            <div className="landing-feature-label landing-feature-label--purple">[02] REAL-TIME</div>
            <h3 className="landing-feature-title">Live Price Feeds</h3>
            <p className="landing-feature-desc">
              Powered by Pyth Network oracle. ETH, BTC, SOL, BNB prices updated every millisecond.
            </p>
          </div>

          <div className="landing-feature-card landing-feature-card--mint">
            <div className="landing-feature-glow landing-feature-glow--mint" />
            <div className="landing-feature-label landing-feature-label--mint">[03] SECURE</div>
            <h3 className="landing-feature-title">Base Mainnet</h3>
            <p className="landing-feature-desc">
              Built on Base L2. All funds secured by Nitrolite custody contracts. Non-custodial, trustless.
            </p>
          </div>
        </div>

        <div className="landing-stats-bar">
          <div>
            <div className="landing-stat-value landing-stat-value--mint"></div>
            <div className="landing-stat-label">Settlement Time</div>
          </div>
          <div>
            <div className="landing-stat-value landing-stat-value--purple">$0</div>
            <div className="landing-stat-label">Gas Fees</div>
          </div>
          <div>
            <div className="landing-stat-value landing-stat-value--mint">24/7</div>
            <div className="landing-stat-label">Always Live</div>
          </div>
          <div>
            <div className="landing-stat-value landing-stat-value--purple">100%</div>
            <div className="landing-stat-label">Non-Custodial</div>
          </div>
        </div>
      </div>

      <footer className="landing-footer">
        <div className="landing-footer-content">
          <div>© 2026 OMIKUJI // POWERED BY YELLOW NETWORK</div>
          <div className="landing-footer-links">
            <a href="#" className="landing-footer-link">[DOCS]</a>
            <a href="#" className="landing-footer-link landing-footer-link--purple">[TWITTER]</a>
            <a href="#" className="landing-footer-link">[DISCORD]</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
