import React, { useEffect, useState, useRef } from 'react';
import './DAWContextMenu.css';

const DAWContextMenu = () => {
  const [contextData, setContextData] = useState({
    visible: false,
    x: 0,
    y: 0,
    type: null, // 'lyric', 'track'
    targetId: null
  });
  
  const menuRef = useRef(null);

  useEffect(() => {
    const handleContextMenu = (e) => {
      // Find closest element with a context menu type
      const target = e.target.closest('[data-context-type]');
      if (!target) {
        setContextData({ visible: false, x: 0, y: 0, type: null, targetId: null });
        return;
      }

      e.preventDefault();
      
      const type = target.getAttribute('data-context-type');
      const targetId = target.getAttribute('data-context-id');

      setContextData({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        type,
        targetId
      });
    };

    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setContextData(prev => ({ ...prev, visible: false }));
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setContextData(prev => ({ ...prev, visible: false }));
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (!contextData.visible) return null;

  const handleAction = (action) => {
    console.log(`Action [${action}] on target [${contextData.targetId}] of type [${contextData.type}]`);
    // Here you would dispatch to DAWContext or other handlers based on action
    setContextData({ ...contextData, visible: false });
  };

  const renderMenuItems = () => {
    if (contextData.type === 'lyric') {
      return (
        <>
          <div className="gm-menu-item" onClick={() => handleAction('suggest_rhyme')}>Suggest Rhyme</div>
          <div className="gm-menu-item" onClick={() => handleAction('rewrite_cadence')}>Rewrite with Artist Cadence</div>
          <div className="gm-menu-item" onClick={() => handleAction('fill_blank')}>Fill the Blank</div>
          <div className="gm-menu-separator"></div>
          <div className="gm-menu-item" onClick={() => handleAction('copy')}>Copy</div>
        </>
      );
    }

    if (contextData.type === 'track') {
      return (
        <>
          <div className="gm-menu-item" onClick={() => handleAction('generate_preview')}>Generate Audio Preview</div>
          <div className="gm-menu-item" onClick={() => handleAction('duplicate_track')}>Duplicate Track</div>
          <div className="gm-menu-item" onClick={() => handleAction('add_vst3')}>Add VST3 Insert</div>
          <div className="gm-menu-separator"></div>
          <div className="gm-menu-item gm-menu-item-danger" onClick={() => handleAction('delete_track')}>Delete</div>
        </>
      );
    }

    return null;
  };

  // Adjust position to avoid going off-screen
  const style = {
    top: contextData.y,
    left: contextData.x
  };

  return (
    <div 
      className="gm-context-menu" 
      style={style} 
      ref={menuRef}
    >
      {renderMenuItems()}
    </div>
  );
};

export default DAWContextMenu;
