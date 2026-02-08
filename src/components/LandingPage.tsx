'use client';

import { useRouter } from 'next/navigation';
import { useUserSync } from '@/hooks/useUserSync';
import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { metaMask } from 'wagmi/connectors';

export default function LandingPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { userData, isSyncing } = useUserSync();
  const [glitchActive, setGlitchActive] = useState(false);
    const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()

  // Auto-redirect to game when wallet is connected and user is synced
  useEffect(() => {
    if (isConnected && userData && !isSyncing) {
      console.log('[Landing] User synced, redirecting to game...');
      setGlitchActive(true);
      setTimeout(() => router.push('/game'), 500);
    }
  }, [isConnected, userData, isSyncing, router]);

  // Glitch effect on title
  useEffect(() => {
    const interval = setInterval(() => {
      setGlitchActive(true);
      setTimeout(() => setGlitchActive(false), 200);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000000',
      color: '#FFFFFF',
      fontFamily: 'Inter, -apple-system, sans-serif',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Scan line overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.15), rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px)',
        pointerEvents: 'none',
        zIndex: 50,
        opacity: 0.3
      }} />

      {/* Grid background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(rgba(178, 255, 158, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(178, 255, 158, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
        opacity: 0.4,
        pointerEvents: 'none'
      }} />

      {/* Gradient orbs */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-5%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(178, 255, 158, 0.15) 0%, transparent 70%)',
        filter: 'blur(100px)',
        animation: 'float 8s ease-in-out infinite',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        left: '-5%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(182, 166, 255, 0.15) 0%, transparent 70%)',
        filter: 'blur(100px)',
        animation: 'float 10s ease-in-out infinite reverse',
        pointerEvents: 'none'
      }} />

      {/* Navbar */}
      <nav style={{
        position: 'relative',
        zIndex: 10,
        padding: '24px 0',
        borderBottom: '1px solid rgba(178, 255, 158, 0.1)',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{
            fontSize: '24px',
            fontWeight: '700',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontFamily: 'monospace',
            color: '#B2FF9E',
            textShadow: '0 0 20px rgba(178, 255, 158, 0.5)'
          }}>
            おみくじ
          </div>
          {isSyncing && (
            <div style={{
              fontSize: '12px',
              color: '#B6A6FF',
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              [Syncing...]
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '100px 32px',
        textAlign: 'center'
      }}>
        {/* Main Heading with Glitch Effect */}
        <div style={{
          position: 'relative',
          marginBottom: '32px'
        }}>
          <h1 style={{
            fontSize: 'clamp(48px, 8vw, 96px)',
            fontWeight: '900',
            letterSpacing: '-0.04em',
            lineHeight: '1',
            marginBottom: '16px',
            fontFamily: 'monospace',
            textTransform: 'uppercase',
            position: 'relative',
            display: 'inline-block'
          }}>
            <span style={{
              background: 'linear-gradient(180deg, #FFFFFF 0%, #B2FF9E 50%, #B6A6FF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              position: 'relative',
              zIndex: 1,
              textShadow: glitchActive ? '0.05em 0 0 rgba(255,0,0,0.75), -0.025em -0.05em 0 rgba(0,255,0,0.75), 0.025em 0.05em 0 rgba(0,0,255,0.75)' : 'none',
              transform: glitchActive ? 'skew(-2deg)' : 'none',
              transition: 'all 0.1s'
            }}>
              PREDICT
              <br />
              <span style={{ color: '#B2FF9E' }}>WIN</span>
              <span style={{ color: '#FFFFFF' }}>.</span>
              <span style={{ color: '#B6A6FF' }}>INSTANT</span>
            </span>
          </h1>

          {/* Corner brackets */}
          <div style={{
            position: 'absolute',
            top: '-10px',
            left: '-10px',
            width: '40px',
            height: '40px',
            borderTop: '2px solid #B2FF9E',
            borderLeft: '2px solid #B2FF9E'
          }} />
          <div style={{
            position: 'absolute',
            top: '-10px',
            right: '-10px',
            width: '40px',
            height: '40px',
            borderTop: '2px solid #B6A6FF',
            borderRight: '2px solid #B6A6FF'
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-10px',
            left: '-10px',
            width: '40px',
            height: '40px',
            borderBottom: '2px solid #B2FF9E',
            borderLeft: '2px solid #B2FF9E'
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-10px',
            right: '-10px',
            width: '40px',
            height: '40px',
            borderBottom: '2px solid #B6A6FF',
            borderRight: '2px solid #B6A6FF'
          }} />
        </div>

        {/* Subtitle */}
        <p style={{
          fontSize: 'clamp(16px, 2.5vw, 20px)',
          color: '#A0A0A0',
          maxWidth: '700px',
          margin: '0 auto 64px',
          lineHeight: '1.6',
          fontFamily: 'monospace',
          letterSpacing: '0.05em'
        }}>
          Fast crypto prediction markets on{' '}
          <span style={{ color: '#B2FF9E', fontWeight: '600' }}>Yellow Network</span>
          {' '}// Zero gas // Instant settlement
        </p>

        {/* Connect Buttons */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '400px',
          margin: '0 auto 100px'
        }}>
          {connectors.map((connector, index) => (
            <button
              key={index}
              onClick={() => connector.connect()}
              disabled={isSyncing}
              style={{
                padding: '20px 48px',
                background: isSyncing
                  ? 'rgba(255, 255, 255, 0.05)'
                  : 'linear-gradient(135deg, #B2FF9E 0%, #B6A6FF 100%)',
                border: '1px solid rgba(178, 255, 158, 0.3)',
                borderRadius: '0',
                color: isSyncing ? '#666666' : '#000000',
                fontSize: '16px',
                fontWeight: '700',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                boxShadow: isSyncing ? 'none' : '0 0 30px rgba(178, 255, 158, 0.3)',
                opacity: isSyncing ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (!isSyncing) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 0 40px rgba(178, 255, 158, 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSyncing) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 0 30px rgba(178, 255, 158, 0.3)';
                }
              }}
            >
              {isSyncing ? '[SYNCING...]' : `[CONNECT ${connector.name.toUpperCase()}]`}
            </button>
          ))}
        </div>

        {/* Feature Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          {/* Feature 1 */}
          <div style={{
            background: 'rgba(18, 18, 18, 0.6)',
            border: '1px solid rgba(178, 255, 158, 0.1)',
            borderLeft: '4px solid #B2FF9E',
            padding: '32px 24px',
            backdropFilter: 'blur(10px)',
            textAlign: 'left',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '100px',
              height: '100px',
              background: 'radial-gradient(circle, rgba(178, 255, 158, 0.1) 0%, transparent 70%)',
              filter: 'blur(30px)'
            }} />
            <div style={{
              fontSize: '14px',
              color: '#B2FF9E',
              marginBottom: '16px',
              fontFamily: 'monospace',
              fontWeight: '600',
              letterSpacing: '0.1em'
            }}>
              [01] INSTANT
            </div>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '700',
              marginBottom: '12px',
              color: '#FFFFFF',
              fontFamily: 'monospace'
            }}>
              Gas-Free Betting
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#A0A0A0',
              lineHeight: '1.6'
            }}>
              Place unlimited bets off-chain using Yellow Network state channels. No gas fees, no waiting.
            </p>
          </div>

          {/* Feature 2 */}
          <div style={{
            background: 'rgba(18, 18, 18, 0.6)',
            border: '1px solid rgba(182, 166, 255, 0.1)',
            borderLeft: '4px solid #B6A6FF',
            padding: '32px 24px',
            backdropFilter: 'blur(10px)',
            textAlign: 'left',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '100px',
              height: '100px',
              background: 'radial-gradient(circle, rgba(182, 166, 255, 0.1) 0%, transparent 70%)',
              filter: 'blur(30px)'
            }} />
            <div style={{
              fontSize: '14px',
              color: '#B6A6FF',
              marginBottom: '16px',
              fontFamily: 'monospace',
              fontWeight: '600',
              letterSpacing: '0.1em'
            }}>
              [02] REAL-TIME
            </div>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '700',
              marginBottom: '12px',
              color: '#FFFFFF',
              fontFamily: 'monospace'
            }}>
              Live Price Feeds
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#A0A0A0',
              lineHeight: '1.6'
            }}>
              Powered by Pyth Network oracle. ETH, BTC, SOL, BNB prices updated every millisecond.
            </p>
          </div>

          {/* Feature 3 */}
          <div style={{
            background: 'rgba(18, 18, 18, 0.6)',
            border: '1px solid rgba(178, 255, 158, 0.1)',
            borderLeft: '4px solid #B2FF9E',
            padding: '32px 24px',
            backdropFilter: 'blur(10px)',
            textAlign: 'left',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '100px',
              height: '100px',
              background: 'radial-gradient(circle, rgba(178, 255, 158, 0.1) 0%, transparent 70%)',
              filter: 'blur(30px)'
            }} />
            <div style={{
              fontSize: '14px',
              color: '#B2FF9E',
              marginBottom: '16px',
              fontFamily: 'monospace',
              fontWeight: '600',
              letterSpacing: '0.1em'
            }}>
              [03] SECURE
            </div>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '700',
              marginBottom: '12px',
              color: '#FFFFFF',
              fontFamily: 'monospace'
            }}>
              Base Mainnet
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#A0A0A0',
              lineHeight: '1.6'
            }}>
              Built on Base L2. All funds secured by Nitrolite custody contracts. Non-custodial, trustless.
            </p>
          </div>
        </div>

        {/* Stats Bar */}
        <div style={{
          marginTop: '100px',
          padding: '32px',
          background: 'rgba(18, 18, 18, 0.8)',
          border: '1px solid rgba(178, 255, 158, 0.1)',
          borderTop: '2px solid #B2FF9E',
          backdropFilter: 'blur(10px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '32px',
          textAlign: 'center'
        }}>
          <div>
            <div style={{
              fontSize: '36px',
              fontWeight: '700',
              color: '#B2FF9E',
              fontFamily: 'monospace',
              marginBottom: '8px'
            }}>
            </div>
            <div style={{
              fontSize: '12px',
              color: '#A0A0A0',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontFamily: 'monospace'
            }}>
              Settlement Time
            </div>
          </div>
          <div>
            <div style={{
              fontSize: '36px',
              fontWeight: '700',
              color: '#B6A6FF',
              fontFamily: 'monospace',
              marginBottom: '8px'
            }}>
              $0
            </div>
            <div style={{
              fontSize: '12px',
              color: '#A0A0A0',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontFamily: 'monospace'
            }}>
              Gas Fees
            </div>
          </div>
          <div>
            <div style={{
              fontSize: '36px',
              fontWeight: '700',
              color: '#B2FF9E',
              fontFamily: 'monospace',
              marginBottom: '8px'
            }}>
              24/7
            </div>
            <div style={{
              fontSize: '12px',
              color: '#A0A0A0',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontFamily: 'monospace'
            }}>
              Always Live
            </div>
          </div>
          <div>
            <div style={{
              fontSize: '36px',
              fontWeight: '700',
              color: '#B6A6FF',
              fontFamily: 'monospace',
              marginBottom: '8px'
            }}>
              100%
            </div>
            <div style={{
              fontSize: '12px',
              color: '#A0A0A0',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontFamily: 'monospace'
            }}>
              Non-Custodial
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        position: 'relative',
        zIndex: 1,
        borderTop: '1px solid rgba(178, 255, 158, 0.1)',
        padding: '32px 0',
        marginTop: '100px'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: '#666666',
          fontFamily: 'monospace'
        }}>
          <div>
            © 2026 OMIKUJI // POWERED BY YELLOW NETWORK
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            <a href="#" style={{ color: '#666666', textDecoration: 'none', transition: 'color 0.3s' }}
               onMouseEnter={(e) => e.currentTarget.style.color = '#B2FF9E'}
               onMouseLeave={(e) => e.currentTarget.style.color = '#666666'}>
              [DOCS]
            </a>
            <a href="#" style={{ color: '#666666', textDecoration: 'none', transition: 'color 0.3s' }}
               onMouseEnter={(e) => e.currentTarget.style.color = '#B6A6FF'}
               onMouseLeave={(e) => e.currentTarget.style.color = '#666666'}>
              [TWITTER]
            </a>
            <a href="#" style={{ color: '#666666', textDecoration: 'none', transition: 'color 0.3s' }}
               onMouseEnter={(e) => e.currentTarget.style.color = '#B2FF9E'}
               onMouseLeave={(e) => e.currentTarget.style.color = '#666666'}>
              [DISCORD]
            </a>
          </div>
        </div>
      </footer>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(30px, -30px) rotate(5deg); }
          66% { transform: translate(-20px, 20px) rotate(-5deg); }
        }
      `}</style>
    </div>
  );
}
