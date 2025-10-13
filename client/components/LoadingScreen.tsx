import { useState, useEffect, CSSProperties } from 'react';

const loadingMessages = [
  'Cargando contratos cerca tuyo...',
  'Buscando doers disponibles...',
  'Conectando con profesionales...',
  'Preparando tus oportunidades...',
  'Cargando trabajos recientes...',
  'Sincronizando tu perfil...',
];

interface LoadingScreenProps {
  onLoadingComplete?: () => void;
  duration?: number;
}

export default function LoadingScreen({
  onLoadingComplete,
  duration = 3000
}: LoadingScreenProps) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    setTimeout(() => setIsVisible(true), 100);

    // Cycle through messages
    const messageInterval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 1500);

    // Complete loading after duration
    const loadingTimeout = setTimeout(() => {
      if (onLoadingComplete) {
        onLoadingComplete();
      }
    }, duration);

    return () => {
      clearInterval(messageInterval);
      clearTimeout(loadingTimeout);
    };
  }, [duration, onLoadingComplete]);

  const styles: Record<string, CSSProperties> = {
    container: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      opacity: isVisible ? 1 : 0,
      transition: 'opacity 0.8s ease-in-out',
    },
    logoContainer: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      marginBottom: '100px',
      animation: 'logoEntrance 0.8s ease-out forwards',
    },
    logoPlaceholder: {
      width: '120px',
      height: '120px',
      borderRadius: '30px',
      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: '20px',
      boxShadow: '0 10px 30px rgba(59, 130, 246, 0.3), 0 20px 50px rgba(59, 130, 246, 0.15)',
      animation: 'logoFloat 3s ease-in-out infinite',
    },
    logoText: {
      fontSize: '48px',
      fontWeight: 'bold',
      color: '#ffffff',
      textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
    },
    appName: {
      fontSize: '32px',
      fontWeight: 'bold',
      color: '#1e293b',
      letterSpacing: '4px',
      margin: 0,
      animation: 'textFadeIn 1s ease-out 0.3s forwards',
      opacity: isVisible ? 1 : 0,
    },
    messagesContainer: {
      position: 'fixed',
      bottom: '80px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      animation: 'messagesFadeIn 1s ease-out 0.5s forwards',
      opacity: isVisible ? 1 : 0,
    },
    loadingMessage: {
      fontSize: '16px',
      color: '#64748b',
      marginBottom: '20px',
      textAlign: 'center',
      fontWeight: '500',
      minHeight: '24px',
      animation: 'messagePulse 1.5s ease-in-out infinite',
    },
    dotsContainer: {
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
    },
    dot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      backgroundColor: '#cbd5e1',
      transition: 'all 0.3s ease',
    },
    dotActive: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      backgroundColor: '#3b82f6',
      transform: 'scale(1.3)',
      boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
      transition: 'all 0.3s ease',
    },
  };

  return (
    <>
      <style>{`
        @keyframes logoEntrance {
          from {
            opacity: 0;
            transform: scale(0.8) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes logoFloat {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes textFadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes messagesFadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes messagePulse {
          0%, 100% {
            opacity: 0.7;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
      <div style={styles.container}>
        {/* Logo */}
        <div style={styles.logoContainer}>
          {/* Placeholder for logo - replace with actual logo */}
          <div style={styles.logoPlaceholder}>
            <span style={styles.logoText}>DO</span>
          </div>
          <h1 style={styles.appName}>DOAPP</h1>
        </div>

        {/* Loading Messages */}
        <div style={styles.messagesContainer}>
          <p style={styles.loadingMessage}>
            {loadingMessages[currentMessageIndex]}
          </p>

          {/* Loading dots animation */}
          <div style={styles.dotsContainer}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={currentMessageIndex % 3 === i ? styles.dotActive : styles.dot}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
