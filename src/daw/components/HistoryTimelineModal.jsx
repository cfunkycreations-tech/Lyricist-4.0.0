import React, { useState, useEffect } from 'react';
import './HistoryTimelineModal.css';
import sessionHistoryService from '../services/SessionHistoryService';

/**
 * HistoryTimelineModal
 * Surgical Gunmetal session history browser.
 */
export default function HistoryTimelineModal({ onClose, onRestore }) {
  const [history, setHistory] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [newBranchName, setNewBranchName] = useState('');

  useEffect(() => {
    const currentHistory = sessionHistoryService.getHistory();
    setHistory(currentHistory);
    if (currentHistory.length > 0) {
      setSelectedNode(currentHistory[currentHistory.length - 1]);
    }
  }, []);

  const handleRestore = () => {
    if (selectedNode) {
      const snapshot = sessionHistoryService.restoreCheckpoint(selectedNode.id);
      if (onRestore && snapshot) {
        onRestore(snapshot);
      }
      onClose();
    }
  };

  const handleCreateBranch = (e) => {
    e.preventDefault();
    if (newBranchName.trim()) {
      sessionHistoryService.createBranch(newBranchName.trim());
      setNewBranchName('');
    }
  };

  return (
    <div className="history-modal-overlay" onClick={onClose}>
      <div className="history-modal" onClick={e => e.stopPropagation()}>
        <div className="history-modal-header">
          <h2>Session Version History</h2>
          <button className="history-close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div className="history-modal-body">
          <div className="history-timeline">
            <div className="timeline-line"></div>
            {history.map(node => (
              <div 
                key={node.id} 
                className={`history-node ${selectedNode?.id === node.id ? 'selected' : ''}`}
                onClick={() => setSelectedNode(node)}
              >
                <div className="node-dot"></div>
                <div className="node-content">
                  <div className="node-title">{node.label}</div>
                  <div className="node-meta">
                    <span className="node-time">{new Date(node.timestamp).toLocaleString()}</span>
                    <span className="node-branch">{node.branch}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="history-details">
            {selectedNode ? (
              <>
                <div className="details-card">
                  <h3>{selectedNode.label}</h3>
                  <div className="details-stat">
                    <span className="label">Tracks Count</span>
                    <span className="value">{selectedNode.tracksCount}</span>
                  </div>
                  <div className="details-stat">
                    <span className="label">Lyric Lines</span>
                    <span className="value">{selectedNode.lyricLinesCount}</span>
                  </div>
                  {selectedNode.snapshot.bpm && (
                    <div className="details-stat">
                      <span className="label">BPM / Key</span>
                      <span className="value">{selectedNode.snapshot.bpm} / {selectedNode.snapshot.key || 'N/A'}</span>
                    </div>
                  )}
                  {selectedNode.snapshot.snippet && (
                    <div className="lyric-snippet">
                      "{selectedNode.snapshot.snippet}"
                    </div>
                  )}
                </div>
                
                <button className="restore-btn" onClick={handleRestore}>
                  Restore This Checkpoint
                </button>
                
                <form className="branch-form" onSubmit={handleCreateBranch}>
                  <input 
                    type="text" 
                    className="branch-input" 
                    placeholder="New branch name..." 
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                  />
                  <button type="submit" className="branch-btn">Create Branch</button>
                </form>
              </>
            ) : (
              <div className="no-selection">Select a checkpoint to view details</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
