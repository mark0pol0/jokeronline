import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import './MultiplayerStyles.css';

const normalizeSocketUrl = (rawValue: string, fallback: string): string => {
  const value = rawValue.trim();
  if (!value) {
    return fallback;
  }

  const hasProtocol = /^https?:\/\//i.test(value);
  const candidate = hasProtocol ? value : `https://${value}`;

  try {
    const url = new URL(candidate);
    url.pathname = '/';
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    console.warn('[connection-settings] Invalid URL provided, falling back to raw value.', { value, error });
    return fallback;
  }
};

const ConnectionSettings: React.FC = () => {
  const { isConnected, socketUrl, connectionError, setSocketUrl, reconnect } = useSocket();
  const [isEditing, setIsEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState(socketUrl);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setDraftUrl(socketUrl);
  }, [socketUrl]);

  useEffect(() => {
    if (!isConnected && connectionError) {
      setFeedback(null);
    }
  }, [isConnected, connectionError]);

  const hostLabel = useMemo(() => {
    try {
      const parsed = new URL(socketUrl);
      return parsed.host || socketUrl;
    } catch (error) {
      return socketUrl;
    }
  }, [socketUrl]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeSocketUrl(draftUrl, socketUrl);
    setSocketUrl(normalized);
    reconnect();
    setFeedback('Server URL saved. Attempting to connect…');
    setIsEditing(false);
  };

  const handleReset = () => {
    setSocketUrl('');
    reconnect();
    setFeedback('Reverted to the default server URL.');
    setIsEditing(false);
  };

  return (
    <section
      className={`connection-banner ${isConnected ? 'is-online' : 'is-offline'}`}
      aria-live="polite"
    >
      <div className="connection-header">
        <span className="status-dot" aria-hidden />
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      <div className="connection-details">
        <span className="connection-url" title={socketUrl}>
          {hostLabel}
        </span>
        {!isConnected && !connectionError && (
          <span className="connection-error">
            No active server detected. Launch the Socket.IO server locally or point the client to a hosted instance.
          </span>
        )}
        {connectionError && (
          <span className="connection-error">{connectionError}</span>
        )}
        {feedback && <span className="connection-feedback">{feedback}</span>}
      </div>

      <button type="button" className="text-button" onClick={() => setIsEditing((prev) => !prev)}>
        {isEditing ? 'Close settings' : 'Configure server'}
      </button>

      {isEditing && (
        <form className="connection-form" onSubmit={handleSubmit}>
          <label htmlFor="socket-url">Socket server URL</label>
          <input
            id="socket-url"
            name="socket-url"
            type="text"
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            placeholder="https://joker-pursuit-server.example.com"
            autoComplete="off"
          />
          <p className="connection-help">
            Deploy the multiplayer hub with the free Fly.io tier or any Node-friendly host, then paste the resulting HTTPS URL
            here.{' '}
            You can also run <code>npm run dev</code> inside <code>joker-pursuit/server</code> and expose it with a tunnel such
            as <code>flyctl proxy</code> or <code>ngrok http 8080</code>.
          </p>
          <div className="connection-actions">
            <button type="submit" className="skeuomorphic-button primary-button">
              <span className="button-text">Save &amp; reconnect</span>
              <div className="button-shine" />
            </button>
            <button type="button" className="skeuomorphic-button secondary-button" onClick={handleReset}>
              <span className="button-text">Use default</span>
              <div className="button-shine" />
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

export default ConnectionSettings;
