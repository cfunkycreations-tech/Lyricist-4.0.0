import React from 'react';
import { useDAW } from '../context/DAWContext';
import './RenderQueueTray.css';

const RenderQueueTray = () => {
  const { renderQueue, updateRenderJob, clearCompletedJobs, addClipToTrack } = useDAW();

  if (!renderQueue || renderQueue.length === 0) {
    return null;
  }

  const handleDismiss = (jobId) => {
    updateRenderJob(jobId, { status: 'dismissed' });
  };

  const handleDropToPlayhead = (job) => {
    // In a real implementation this would fetch the result clip and place it
    if (job.trackId) {
      addClipToTrack(job.trackId, {
        id: `clip-${Date.now()}`,
        name: `${job.name} Render`,
        start: 0,
        length: 4
      });
    }
    updateRenderJob(job.id, { status: 'dismissed' });
  };

  const activeJobs = renderQueue.filter(j => j.status === 'active' || j.status === 'completed');

  if (activeJobs.length === 0) {
    return null;
  }

  return (
    <div className="gm-render-queue-tray">
      <div className="gm-render-queue-header">
        <h4>Render Queue</h4>
        <button className="gm-btn-clear" onClick={clearCompletedJobs}>Clear Done</button>
      </div>
      <div className="gm-render-queue-list">
        {activeJobs.map(job => {
          const isDone = job.status === 'completed';
          return (
            <div key={job.id} className="gm-render-job">
              <div className="gm-job-info">
                <span className="gm-job-name">{job.name}</span>
                <span className={`gm-job-status ${isDone ? 'gm-status-done' : 'gm-status-active'}`}>
                  {isDone ? 'Finished' : `${Math.round(job.progress)}%`}
                </span>
              </div>
              <div className="gm-progress-bar-bg">
                <div 
                  className={`gm-progress-bar-fill ${isDone ? 'done' : ''}`} 
                  style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
                />
              </div>
              {isDone && (
                <div className="gm-job-actions">
                  <button onClick={() => handleDropToPlayhead(job)} className="gm-btn-primary">Drop to Playhead</button>
                  <button onClick={() => handleDismiss(job.id)} className="gm-btn-secondary">Dismiss</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RenderQueueTray;
