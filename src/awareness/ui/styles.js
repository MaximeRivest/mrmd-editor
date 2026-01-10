/**
 * Awareness UI Styles
 *
 * CSS styles for all awareness components.
 * Can be injected automatically or used as a reference.
 *
 * @module awareness/ui/styles
 */

// #region STYLES

export const awarenessStyles = `
/* ==========================================================================
   MRMD Awareness Styles
   ========================================================================== */

/* Hide y-codemirror.next's built-in cursor rendering.
   We use our own awareness system for all cursor/presence rendering
   so that humans, AI, and runtimes are treated uniformly. */
.cm-ySelectionCaret {
  display: none !important;
}
.cm-ySelectionCaretDot {
  display: none !important;
}
.cm-ySelectionInfo {
  display: none !important;
}

/* CSS Custom Properties */
.mrmd-awareness-root {
  --mrmd-bg: #1e1e1e;
  --mrmd-bg-secondary: #252525;
  --mrmd-border: #333;
  --mrmd-text: #e0e0e0;
  --mrmd-text-muted: #888;
  --mrmd-font-mono: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

/* Light mode overrides */
.mrmd-awareness-root--light {
  --mrmd-bg: #ffffff;
  --mrmd-bg-secondary: #f5f5f5;
  --mrmd-border: #e0e0e0;
  --mrmd-text: #1a1a1a;
  --mrmd-text-muted: #666;
}

/* ==========================================================================
   Collaborator List
   ========================================================================== */

.mrmd-collaborator-list {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  color: var(--mrmd-text, #e0e0e0);
}

.mrmd-collaborator-list__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--mrmd-border, #333);
  background: var(--mrmd-bg-secondary, #252525);
}

.mrmd-collaborator-list__title {
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--mrmd-text-muted, #888);
}

.mrmd-collaborator-list__count {
  background: var(--mrmd-border, #333);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
}

.mrmd-collaborator-list__items {
  padding: 8px;
}

.mrmd-collaborator-list__separator {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--mrmd-text-muted, #666);
  padding: 8px 4px 4px;
  margin-top: 8px;
}

.mrmd-collaborator-list__separator span {
  background: var(--mrmd-bg, #1e1e1e);
  padding-right: 8px;
}

.mrmd-collaborator-list__empty {
  padding: 16px;
  text-align: center;
  color: var(--mrmd-text-muted, #666);
  font-style: italic;
}

/* Collaborator Item */
.mrmd-collaborator-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  margin-bottom: 4px;
  transition: background 0.15s;
}

.mrmd-collaborator-item:hover {
  background: var(--mrmd-bg-secondary, #252525);
}

.mrmd-collaborator-item--self {
  background: rgba(59, 130, 246, 0.1);
}

/* Avatar */
.mrmd-collaborator-item__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
  position: relative;
}

.mrmd-collaborator-item__status-dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--mrmd-bg, #1e1e1e);
  background: #888;
}

.mrmd-collaborator-item__status-dot--typing {
  background: #3b82f6;
  animation: pulse 1s infinite;
}

.mrmd-collaborator-item__status-dot--executing {
  background: #10b981;
  animation: pulse 0.5s infinite;
}

.mrmd-collaborator-item__status-dot--streaming {
  background: #8b5cf6;
  animation: pulse 0.8s infinite;
}

.mrmd-collaborator-item__status-dot--selecting {
  background: #f59e0b;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(0.9); }
}

/* Info */
.mrmd-collaborator-item__info {
  flex: 1;
  min-width: 0;
}

.mrmd-collaborator-item__name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mrmd-collaborator-item__name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mrmd-collaborator-item__badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-weight: 500;
}

.mrmd-collaborator-item__badge--human {
  background: #238636;
  color: white;
}

.mrmd-collaborator-item__badge--ai {
  background: #8b5cf6;
  color: white;
}

.mrmd-collaborator-item__badge--runtime {
  background: #1f6feb;
  color: white;
}

.mrmd-collaborator-item__badge--sync {
  background: #6b7280;
  color: white;
}

/* Activity */
.mrmd-collaborator-item__activity {
  font-size: 12px;
  color: var(--mrmd-text-muted, #888);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mrmd-collaborator-item__activity code {
  background: var(--mrmd-border, #333);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: var(--mrmd-font-mono);
  font-size: 11px;
}

.mrmd-collaborator-item__activity .activity-executing,
.mrmd-collaborator-item__activity .activity-streaming {
  color: #10b981;
}

.mrmd-collaborator-item__activity .activity-hover,
.mrmd-collaborator-item__activity .activity-autocomplete {
  color: #3b82f6;
}

.mrmd-collaborator-item__activity .activity-typing {
  color: #f59e0b;
}

.mrmd-collaborator-item__activity .activity-progress,
.mrmd-collaborator-item__activity .activity-tokens {
  color: #8b5cf6;
}

/* ==========================================================================
   Avatar Row (Compact)
   ========================================================================== */

.mrmd-avatar-row {
  display: flex;
  align-items: center;
  gap: -8px; /* Overlap avatars */
}

.mrmd-avatar-row__avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: white;
  border: 2px solid var(--mrmd-bg, #1e1e1e);
  margin-left: -8px;
}

.mrmd-avatar-row__avatar:first-child {
  margin-left: 0;
}

.mrmd-avatar-row__avatar--typing {
  box-shadow: 0 0 0 2px #3b82f6;
}

.mrmd-avatar-row__avatar--executing {
  box-shadow: 0 0 0 2px #10b981;
}

.mrmd-avatar-row__more {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--mrmd-text-muted, #888);
  background: var(--mrmd-border, #333);
  margin-left: -8px;
}

/* ==========================================================================
   Cursor Widget (Combined Caret + Label)
   ========================================================================== */

.mrmd-cursor-widget {
  position: relative;
  display: inline-block;
  vertical-align: baseline;
}

/* ==========================================================================
   Cursor Labels
   ========================================================================== */

.mrmd-cursor-label {
  position: absolute;
  top: -20px;
  left: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.15s, transform 0.15s;
  background: var(--cursor-color, #666);
  color: white;
  z-index: 100;
}

/* Always-visible labels (default mode) */
.mrmd-cursor-label--always {
  opacity: 1;
  transform: translateY(0);
}

/* Hover mode: fade in on hover near the caret area */
.mrmd-cursor-caret:hover ~ .mrmd-cursor-label,
.mrmd-cursor-label:hover {
  opacity: 1;
  transform: translateY(0);
}

.mrmd-cursor-label__name {
  font-weight: 500;
}

.mrmd-cursor-label__status {
  opacity: 0.8;
}

/* Typing indicator animation */
.typing-indicator {
  display: inline-flex;
  gap: 2px;
}

.typing-indicator span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: white;
  animation: typingBounce 1s infinite;
}

.typing-indicator span:nth-child(2) { animation-delay: 0.15s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.3s; }

@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
}

/* Executing indicator */
.executing-indicator {
  width: 8px;
  height: 8px;
  border: 2px solid white;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Streaming indicator */
.streaming-indicator {
  width: 8px;
  height: 8px;
  background: white;
  border-radius: 50%;
  animation: streamPulse 1s infinite;
}

@keyframes streamPulse {
  0%, 100% { transform: scale(0.8); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 1; }
}

.mrmd-cursor-label__activity {
  font-size: 10px;
  opacity: 0.8;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ==========================================================================
   Cursor Caret
   ========================================================================== */

.mrmd-cursor-caret {
  display: inline-block;
  width: 2px;
  height: 1.2em;
  margin-left: -1px;
  background: var(--cursor-color, #666);
  animation: caretBlink 1s step-end infinite;
}

.mrmd-cursor-caret--typing {
  animation: none;
  background: var(--cursor-color, #666);
}

.mrmd-cursor-caret--executing {
  animation: caretPulse 0.5s infinite;
}

@keyframes caretBlink {
  50% { opacity: 0; }
}

@keyframes caretPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Remote selection highlight */
.mrmd-remote-selection {
  border-radius: 2px;
}

/* ==========================================================================
   Hover Indicator
   ========================================================================== */

.mrmd-hover-indicator {
  display: inline-block;
  vertical-align: middle;
  margin-right: 2px;
}

.mrmd-hover-indicator__dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--indicator-color, #3b82f6);
  animation: hoverPulse 1.5s infinite;
}

@keyframes hoverPulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.2); }
}

/* ==========================================================================
   Execution Indicator
   ========================================================================== */

.mrmd-execution-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  vertical-align: middle;
}

.mrmd-execution-indicator__spinner {
  width: 10px;
  height: 10px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.mrmd-execution-indicator__label {
  font-weight: 500;
}

.mrmd-execution-indicator__progress {
  width: 40px;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  overflow: hidden;
}

.mrmd-execution-indicator__progress-fill {
  display: block;
  height: 100%;
  background: currentColor;
  transition: width 0.3s;
}

.mrmd-execution-indicator__progress-text {
  font-size: 10px;
  opacity: 0.8;
}

/* ==========================================================================
   Cell Presence
   ========================================================================== */

.mrmd-cell-presence {
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
  vertical-align: middle;
}

.mrmd-cell-presence__avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 600;
  color: white;
  margin-left: -4px;
  border: 1px solid var(--mrmd-bg, #1e1e1e);
}

.mrmd-cell-presence__avatar:first-child {
  margin-left: 0;
}

.mrmd-cell-presence__more {
  font-size: 9px;
  color: var(--mrmd-text-muted, #888);
  margin-left: 2px;
}

/* ==========================================================================
   Status Bar
   ========================================================================== */

.mrmd-status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 12px;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--mrmd-text-muted, #888);
  background: var(--mrmd-bg-secondary, #252525);
  border-top: 1px solid var(--mrmd-border, #333);
}

.mrmd-status-bar__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.mrmd-status-bar__item--executing {
  color: #10b981;
}

.mrmd-status-bar__item--streaming {
  color: #8b5cf6;
}

.mrmd-status-bar__icon {
  font-size: 14px;
}

.mrmd-status-bar__spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.mrmd-status-bar__label {
  font-weight: 500;
}

.mrmd-status-bar__detail {
  opacity: 0.7;
}

.mrmd-status-bar__progress {
  width: 60px;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.mrmd-status-bar__progress-fill {
  display: block;
  height: 100%;
  background: currentColor;
  transition: width 0.3s;
}

.mrmd-status-bar__progress-text {
  font-size: 11px;
  opacity: 0.8;
}

/* ==========================================================================
   Floating Collaborator List
   ========================================================================== */

.mrmd-collaborator-list-floating {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}

.mrmd-collaborator-list--floating {
  padding: 0;
}

.mrmd-collaborator-list--floating .mrmd-collaborator-list__header {
  border-radius: 8px 8px 0 0;
}

.mrmd-collaborator-list--compact .mrmd-collaborator-item {
  padding: 4px 8px;
}

.mrmd-collaborator-list--compact .mrmd-collaborator-item__avatar {
  width: 24px;
  height: 24px;
  font-size: 11px;
}

.mrmd-collaborator-list--compact .mrmd-collaborator-item__activity {
  display: none;
}
`;

// #endregion STYLES

// #region INJECTION

let stylesInjected = false;

/**
 * Inject awareness styles into the document head
 */
export function injectAwarenessStyles() {
  if (stylesInjected) return;
  if (typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.id = 'mrmd-awareness-styles';
  style.textContent = awarenessStyles;
  document.head.appendChild(style);

  stylesInjected = true;
}

/**
 * Remove injected styles
 */
export function removeAwarenessStyles() {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById('mrmd-awareness-styles');
  if (existing) {
    existing.remove();
    stylesInjected = false;
  }
}

// #endregion INJECTION

// #region EXPORTS

export default {
  awarenessStyles,
  injectAwarenessStyles,
  removeAwarenessStyles,
};

// #endregion EXPORTS
