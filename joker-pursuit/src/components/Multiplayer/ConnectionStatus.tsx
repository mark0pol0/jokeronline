import React, { useEffect, useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useMultiplayer } from '../../context/MultiplayerContext';
import './MultiplayerStyles.css';

interface ConnectionStatusProps {
  easyMode?: boolean;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ easyMode = false }) => {
  const {
    isConnected,
    serverUrl,
    connectionError,
    updateServerUrl,
    reconnect
  } = useSocket();
  const { isOnlineMode, roomCode, requestSync } = useMultiplayer();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState(serverUrl);
  const [hasSaved, setHasSaved] = useState(false);

  useEffect(() => {
    setDraftUrl(serverUrl);
  }, [serverUrl]);

  useEffect(() => {
    if (!isDialogOpen) {
      setHasSaved(false);
    }
  }, [isDialogOpen]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateServerUrl(draftUrl);
    setHasSaved(true);
    setTimeout(() => {
      setIsDialogOpen(false);
    }, 400);
  };

  const displayUrl = serverUrl || 'No server configured';

  if (easyMode && isConnected && !connectionError) {
    return null;
  }

  return (
    <div className={`connection-banner ${isConnected ? 'connected' : 'disconnected'}`}>
      <div className="connection-details">
        <span className="status-pill">
          {easyMode && !isConnected ? 'Connection problem' : isConnected ? 'Connected' : 'Disconnected'}
        </span>
        {!easyMode && <span className="server-url" title={displayUrl}>{displayUrl}</span>}
      </div>
      <div className="connection-actions">
        <button
          type="button"
          className="link-button"
          onClick={() => setIsDialogOpen(true)}
        >
          {easyMode ? 'Server Settings' : 'Configure server'}
        </button>
        {!isConnected && (
          <button
            type="button"
            className="link-button"
            onClick={reconnect}
          >
            Retry
          </button>
        )}
        {!easyMode && isConnected && isOnlineMode && roomCode && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              requestSync().catch((error: Error) => {
                console.error('Failed to sync room snapshot', error);
              });
            }}
          >
            Sync now
          </button>
        )}
      </div>
      {!isConnected && connectionError && (
        <p className="connection-error">
          {easyMode ? 'We could not connect to the online game. Try again or open server settings.' : connectionError}
        </p>
      )}

      {isDialogOpen && (
        <div className="connection-modal" role="dialog" aria-modal="true">
          <div className="connection-modal-card">
            <h3 className="connection-modal-title">Server Settings</h3>
            <p className="connection-modal-description">
              {easyMode
                ? 'Only change this if the online game is not connecting.'
                : 'Enter the base URL for your Socket.IO backend.'}
            </p>
            <form onSubmit={handleSubmit} className="modal-form">
              <label htmlFor="serverUrl" className="modal-label">
                Server URL
              </label>
              <input
                id="serverUrl"
                type="text"
                value={draftUrl}
                onChange={(event) => setDraftUrl(event.target.value)}
                placeholder="https://your-server.example.com"
                className="modal-input"
                autoComplete="off"
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="skeuomorphic-button secondary-button"
                  onClick={() => setIsDialogOpen(false)}
                >
                  <span className="button-text">Cancel</span>
                  <div className="button-shine"></div>
                </button>
                <button
                  type="submit"
                  className="skeuomorphic-button primary-button"
                >
                  <span className="button-text">Save &amp; reconnect</span>
                  <div className="button-shine"></div>
                </button>
              </div>
              {hasSaved && (
                <p className="helper-text">Saved! Reconnecting…</p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus;
