import { useState, useEffect } from 'react';

const shortcuts = [
  { key: '?', description: 'Show keyboard shortcuts' },
  { key: '/', description: 'Focus search' },
  { key: 'Esc', description: 'Close modal / Clear search' },
  { key: 'j / ↓', description: 'Navigate down' },
  { key: 'k / ↑', description: 'Navigate up' },
  { key: 'Enter', description: 'Select / Open item' },
  { key: 'n', description: 'New item (when applicable)' },
  { key: 'e', description: 'Edit selected item' },
  { key: 's', description: 'Save current item' },
  { key: 'Ctrl/⌘ + S', description: 'Quick save' },
];

export default function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Show shortcuts overlay on '?' press
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target;
        // Don't trigger if user is typing in an input
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      
      // Close on Escape
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal" onClick={() => setIsOpen(false)} style={{ zIndex: 'var(--z-toast)' }}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 500 }}
      >
        <div className="modal-header">
          <h3>⌨️ Keyboard Shortcuts</h3>
          <button 
            className="close-btn" 
            onClick={() => setIsOpen(false)}
            aria-label="Close shortcuts"
          >
            &times;
          </button>
        </div>
        
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--t3)' }}>
            Use these keyboard shortcuts to navigate faster
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {shortcuts.map((shortcut, index) => (
            <div 
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--t2)' }}>
                {shortcut.description}
              </span>
              <kbd style={{
                padding: '4px var(--space-2)',
                background: 'white',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'monospace',
                fontWeight: 600,
                color: 'var(--t1)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}>
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>

        <div style={{ 
          marginTop: 'var(--space-6)', 
          padding: 'var(--space-3)',
          background: 'rgba(220,38,38,0.05)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-xs)',
          color: 'var(--t3)',
          textAlign: 'center'
        }}>
          Press <kbd style={{
            padding: '2px 6px',
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'monospace',
            fontWeight: 600,
          }}>?</kbd> anytime to toggle this dialog
        </div>
      </div>
    </div>
  );
}
