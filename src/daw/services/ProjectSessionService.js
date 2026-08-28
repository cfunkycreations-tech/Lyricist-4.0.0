class ProjectSessionService {
  constructor() {
    this.RECOVERY_KEY = 'lyricist_recovery_session';
  }

  saveProjectToFile(projectState, filename = 'project.lyricist') {
    const data = {
      version: '4.2.0',
      timestamp: Date.now(),
      tracks: projectState.tracks || [],
      lyrics: projectState.lyrics || '',
      bpm: projectState.bpm || 120,
      key: projectState.key || 'C',
      timeSig: projectState.timeSig || '4/4',
      automation: projectState.automation || {}
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async loadProjectFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.version !== '4.2.0') {
            console.warn(`Version mismatch: expected 4.2.0, got ${data.version}`);
          }
          resolve(data);
        } catch (err) {
          reject(new Error('Invalid .lyricist project file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  saveAutoRecovery(projectState) {
    const data = {
      version: '4.2.0',
      timestamp: Date.now(),
      tracks: projectState.tracks || [],
      lyrics: projectState.lyrics || '',
      bpm: projectState.bpm || 120,
      key: projectState.key || 'C',
      timeSig: projectState.timeSig || '4/4',
      automation: projectState.automation || {}
    };
    try {
      localStorage.setItem(this.RECOVERY_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to save auto-recovery session:', err);
    }
  }

  loadAutoRecovery() {
    try {
      const data = localStorage.getItem(this.RECOVERY_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (err) {
      console.warn('Failed to load auto-recovery session:', err);
    }
    return null;
  }

  createDefaultProject() {
    return {
      version: '4.2.0',
      timestamp: Date.now(),
      tracks: [],
      lyrics: '',
      bpm: 120,
      key: 'C',
      timeSig: '4/4',
      automation: {}
    };
  }
}

const projectSessionService = new ProjectSessionService();
export default projectSessionService;
