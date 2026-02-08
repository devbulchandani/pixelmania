'use client';

import { useState } from 'react';

interface ActivityLogProps {
  messages: string[];
}

export default function ActivityLog({ messages }: ActivityLogProps) {
  const [visible, setVisible] = useState(true);
  const [minimized, setMinimized] = useState(false);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="badge-stat badge-stat-mint activity-log-toggle"
      >
        Show Activity Log
      </button>
    );
  }

  return (
    <div className="glass-card activity-log">
      <div className="activity-log-header">
        <span className="label-xs">ACTIVITY LOG</span>
        <div className="activity-log-controls">
          <button
            onClick={() => setMinimized(!minimized)}
            className="activity-log-btn"
          >
            {minimized ? '+' : '-'}
          </button>
          <button
            onClick={() => setVisible(false)}
            className="activity-log-btn"
          >
            ×
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="activity-log-content">
          {messages?.length > 0 ? (
            messages.slice(-10).map((msg, i) => (
              <div key={i} className="activity-log-message">{msg}</div>
            ))
          ) : (
            <div className="activity-log-empty">No activity yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
