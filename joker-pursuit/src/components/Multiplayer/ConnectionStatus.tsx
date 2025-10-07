import React, { useEffect, useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import './MultiplayerStyles.css';

const ConnectionStatus: React.FC = () => {
  const {
    isConnected,
    serverUrl,
    connectionError,
    updateServerUrl,
    reconnect
  } = useSocket();
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

  return (
    <div className={`connection-banner ${isConnected ? 'connected' : 'disconnected'}`}>
      <div className="connection-details">
        <span className="status-pill">{isConnected ? 'Connected' : 'Disconnected'}</span>
        <span className="server-url" title={displayUrl}>{displayUrl}</span>
      </div>
      <div className="connection-actions">
        <button
          type="button"
          className="link-button"
          onClick={() => setIsDialogOpen(true)}
        >
          Configure server
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
      </div>
      {!isConnected && connectionError && (
        <p className="connection-error">{connectionError}</p>
      )}

      {isDialogOpen && (
        <div className="connection-modal" role="dialog" aria-modal="true">
          <div className="modal-content">
            <h3>Server settings</h3>
            <p>Enter the base URL for your Socket.IO backend.</p>
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
