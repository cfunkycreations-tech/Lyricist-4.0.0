import React, { useState, useEffect, useRef } from 'react';
import './GhostPilotHUD.css';
import ghostPilotDAWBridge from '../services/GhostPilotDAWBridge';

/**
 * GhostPilotHUD
 * Floating Surgical Gunmetal Assistant HUD for Lyricist 4.2.0 Pro.
 */
const GhostPilotHUD = () => {
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState('idle'); // idle, processing, error
  const [messages, setMessages] = useState([
    { id: 1, type: 'system', text: 'Ghost Pilot initialized. Ready for commands.', success: true, timestamp: new Date() }
  ]);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, expanded]);

  // Global Ctrl+G shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setExpanded((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCommand = async (commandText) => {
    if (!commandText.trim()) return;

    const query = commandText.trim();
    setInputValue('');
    setStatus('processing');

    // Add user message
    const userMsg = { id: Date.now(), type: 'user', text: query, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);

    // Execute via bridge
    const result = await ghostPilotDAWBridge.processCommand(query);

    setStatus(result.success ? 'idle' : 'error');
    
    // Reset error led after a moment
    if (!result.success) {
      setTimeout(() => setStatus('idle'), 2000);
    }

    // Add system response
    const sysMsg = {
      id: Date.now() + 1,
      type: 'system',
      text: result.message,
      success: result.success,
      timestamp: new Date()
    };
    setMessages((prev) => [...prev, sysMsg]);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleCommand(inputValue);
    }
  };

  const getLedClass = () => {
    if (status === 'processing') return 'led-processing';
    if (status === 'error') return 'led-error';
    return 'led-idle';
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const quickPrompts = [
    { icon: '⚡', text: 'Generate 4-Bar Drums', cmd: 'generate 4-bar dark trap drums' },
    { icon: '🎹', text: 'Add Neo-Soul Chords', cmd: 'generate neo-soul chords' },
    { icon: '🎙️', text: 'Solo Vocals', cmd: 'solo vocals' },
    { icon: '✍️', text: 'Suggest Rhymes', cmd: 'suggest rhymes for cold' },
  ];

  if (!expanded) {
    return (
      <div className="ghost-pilot-hud">
        <div className="ghost-pilot-pill" onClick={() => setExpanded(true)} title="Ghost Pilot (Ctrl+G)">
          <div className={`led-ring ${getLedClass()}`}></div>
          <span className="pill-text">GHOST PILOT</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ghost-pilot-hud">
      <div className="ghost-pilot-console">
        <div className="console-header">
          <div className="console-title">
            <div className={`led-ring ${getLedClass()}`}></div>
            <span>Ghost Pilot Copilot</span>
          </div>
          <button className="close-btn" onClick={() => setExpanded(false)} aria-label="Close HUD">&times;</button>
        </div>

        <div className="console-body">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-card ${msg.type} ${msg.type === 'system' ? (msg.success ? 'success' : 'error') : ''}`}>
              <div className="chat-text">{msg.text}</div>
              <div className="chat-timestamp">{formatTime(msg.timestamp)}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="quick-chips">
          {quickPrompts.map((p, i) => (
            <button key={i} className="chip" onClick={() => handleCommand(p.cmd)}>
              {p.icon} {p.text}
            </button>
          ))}
        </div>

        <div className="console-footer">
          <input
            type="text"
            className="command-input"
            placeholder="Type a command... (e.g. 'bpm 140')"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={status === 'processing'}
            autoFocus
          />
          <button 
            className="submit-btn" 
            onClick={() => handleCommand(inputValue)}
            disabled={!inputValue.trim() || status === 'processing'}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default GhostPilotHUD;
