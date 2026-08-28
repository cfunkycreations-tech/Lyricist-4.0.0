import React from 'react';
import './MasterScopeModal.css';

/**
 * MasterScopeModal Component
 * Acoustic Scope Modal for visualizing master output
 */
export default function MasterScopeModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content scope-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Master Acoustic Scope</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ background: '#111', padding: '20px', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--gm-led-cyan, #00FFFF)', fontFamily: 'var(--gm-font-metrics, monospace)' }}>
            [SCOPE VISUALIZATION PLACEHOLDER]
          </div>
        </div>
      </div>
    </div>
  );
}
