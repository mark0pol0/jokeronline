import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './PWAInstallPrompt.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_STORAGE_KEY = 'joker-pursuit.pwa-install-dismissed-at';
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 12;

const isStandaloneDisplay = (): boolean => {
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayModeStandalone = typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false;
  return iosStandalone || displayModeStandalone;
};

const isLikelyMobile = (): boolean => {
  const byViewport = typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 900px)').matches
    : false;
  const byUserAgent = /android|iphone|ipad|ipod/i.test(window.navigator.userAgent);
  return byViewport || byUserAgent;
};

const isIosSafari = (): boolean => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(userAgent);
  const safari = /safari/.test(userAgent) && !/crios|fxios|edgios|chrome|android/.test(userAgent);
  return ios && safari;
};

const wasDismissedRecently = (): boolean => {
  const rawValue = window.localStorage.getItem(DISMISS_STORAGE_KEY);
  if (!rawValue) {
    return false;
  }

  const lastDismissed = Number(rawValue);
  if (!Number.isFinite(lastDismissed)) {
    return false;
  }

  return Date.now() - lastDismissed < DISMISS_COOLDOWN_MS;
};

const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  const canShowInstallPrompt = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return isLikelyMobile() && !isStandaloneDisplay() && !wasDismissedRecently();
  }, []);

  const dismissPrompt = useCallback(() => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, `${Date.now()}`);
    setIsVisible(false);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return;
    }

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setIsVisible(false);
      }
    } finally {
      setDeferredPrompt(null);
      setIsInstalling(false);
    }
  }, [deferredPrompt]);

  useEffect(() => {
    if (!canShowInstallPrompt) {
      return;
    }

    if (isIosSafari()) {
      setShowIosInstructions(true);
      setIsVisible(true);
    }
  }, [canShowInstallPrompt]);

  useEffect(() => {
    if (!canShowInstallPrompt) {
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
      setIsVisible(true);
      setShowIosInstructions(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
    };
  }, [canShowInstallPrompt]);

  if (!isVisible || !canShowInstallPrompt) {
    return null;
  }

  const title = showIosInstructions ? 'Install On Your Home Screen' : 'Install Joker Pursuit App';

  return (
    <aside className="pwa-install-banner" role="dialog" aria-live="polite" aria-label="Install Joker Pursuit">
      <div className="pwa-install-content">
        <p className="pwa-install-title">{title}</p>
        {showIosInstructions ? (
          <>
            <p className="pwa-install-text">For fullscreen play on iPhone/iPad:</p>
            <ol className="pwa-install-steps">
              <li>Tap the Share button in Safari.</li>
              <li>Select Add to Home Screen.</li>
              <li>Launch from your Home Screen.</li>
            </ol>
          </>
        ) : (
          <p className="pwa-install-text">Install for fullscreen play, faster relaunch, and offline shell support.</p>
        )}

        <div className="pwa-install-actions">
          {!showIosInstructions && deferredPrompt && (
            <button
              type="button"
              className="pwa-install-button"
              onClick={handleInstall}
              disabled={isInstalling}
            >
              {isInstalling ? 'Installing...' : 'Install'}
            </button>
          )}
          <button type="button" className="pwa-later-button" onClick={dismissPrompt}>
            Not Now
          </button>
        </div>
      </div>
    </aside>
  );
};

export default PWAInstallPrompt;
