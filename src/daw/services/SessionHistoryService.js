/**
 * SessionHistoryService
 * Visual project version history manager.
 */
class SessionHistoryService {
  constructor() {
    this.checkpoints = [];
    this.activeBranch = 'main';
    this.branches = ['main'];
    this.nextId = 1;

    // Pre-seed initial branch checkpoints
    this.recordCheckpoint('Initial Project Boot', { tracksCount: 2, lyricLinesCount: 0, bpm: 120, key: 'C Minor', snippet: '' }, 'main');
    this.recordCheckpoint('Vocal Comp Final', { tracksCount: 16, lyricLinesCount: 24, bpm: 120, key: 'C Minor', snippet: 'Yeah, we riding through the city' }, 'main');
    this.recordCheckpoint('Stems Extracted', { tracksCount: 32, lyricLinesCount: 24, bpm: 120, key: 'C Minor', snippet: 'Yeah, we riding through the city' }, 'main');
  }

  /**
   * Records a new checkpoint.
   * @param {string} label - Checkpoint label.
   * @param {object} projectState - Snapshot of the project state.
   * @param {string} [branch] - Branch name, defaults to active branch.
   * @returns {object} The created checkpoint.
   */
  recordCheckpoint(label, projectState, branch = this.activeBranch) {
    const checkpoint = {
      id: this.nextId++,
      label,
      timestamp: new Date().toISOString(),
      branch,
      tracksCount: projectState.tracksCount || 0,
      lyricLinesCount: projectState.lyricLinesCount || 0,
      snapshot: { ...projectState }
    };
    this.checkpoints.push(checkpoint);
    if (!this.branches.includes(branch)) {
      this.branches.push(branch);
    }
    return checkpoint;
  }

  /**
   * Retrieves the history of checkpoints.
   * @returns {Array} Array of checkpoints sorted chronologically.
   */
  getHistory() {
    return [...this.checkpoints].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /**
   * Restores a checkpoint by ID.
   * @param {number} checkpointId - The ID of the checkpoint to restore.
   * @returns {object|null} The snapshot to hydrate DAWContext, or null if not found.
   */
  restoreCheckpoint(checkpointId) {
    const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId);
    if (checkpoint) {
      this.activeBranch = checkpoint.branch;
      return checkpoint.snapshot;
    }
    return null;
  }

  /**
   * Creates a new branch.
   * @param {string} branchName - Name of the new branch.
   */
  createBranch(branchName) {
    if (!this.branches.includes(branchName)) {
      this.branches.push(branchName);
      this.activeBranch = branchName;
    }
  }

  /**
   * Gets the active branch name.
   * @returns {string} The active branch name.
   */
  getActiveBranch() {
    return this.activeBranch;
  }
}

const sessionHistoryService = new SessionHistoryService();
export default sessionHistoryService;
