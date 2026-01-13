/**
 * @fileoverview Shell component styles
 *
 * Uses the editor's theme tokens for consistent styling.
 * All styles use CSS custom properties that inherit from the theme.
 */

// =============================================================================
// STATUS BAR STYLES
// =============================================================================

export const statusBarStyles = `
/* Status Bar Container */
.mrmd-statusbar {
  display: flex;
  align-items: center;
  gap: 1px;
  height: 24px;
  font-family: var(--mrmd-ui-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: var(--mrmd-ui-font-size-sm, 12px);
  background: var(--mrmd-statusbar-bg, var(--mrmd-panel-bg, #1e1e1e));
  border-top: 1px solid var(--mrmd-statusbar-border, var(--mrmd-border, #333));
  color: var(--mrmd-statusbar-fg, var(--mrmd-fg-muted, #999));
  user-select: none;
  overflow: hidden;
}

.mrmd-statusbar--top {
  border-top: none;
  border-bottom: 1px solid var(--mrmd-statusbar-border, var(--mrmd-border, #333));
}

/* Status Bar Segment */
.mrmd-statusbar__segment {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 100%;
  cursor: pointer;
  transition: background-color 0.15s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mrmd-statusbar__segment:hover {
  background: var(--mrmd-statusbar-hover, var(--mrmd-hover-bg, rgba(255, 255, 255, 0.05)));
}

.mrmd-statusbar__segment:active {
  background: var(--mrmd-statusbar-active, var(--mrmd-active-bg, rgba(255, 255, 255, 0.08)));
}

.mrmd-statusbar__segment--disabled {
  opacity: 0.5;
  cursor: default;
}

.mrmd-statusbar__segment--disabled:hover {
  background: transparent;
}

/* Segment parts */
.mrmd-statusbar__icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mrmd-statusbar__label {
  color: var(--mrmd-statusbar-fg, var(--mrmd-fg, #ccc));
}

.mrmd-statusbar__secondary {
  color: var(--mrmd-statusbar-fg-muted, var(--mrmd-fg-muted, #666));
}

.mrmd-statusbar__chevron {
  font-size: 8px;
  opacity: 0.5;
  margin-left: 2px;
}

/* Status indicator dot */
.mrmd-statusbar__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.mrmd-statusbar__dot--connected,
.mrmd-statusbar__dot--ready,
.mrmd-statusbar__dot--running {
  background: var(--mrmd-success, #4caf50);
}

.mrmd-statusbar__dot--disconnected,
.mrmd-statusbar__dot--stopped {
  background: var(--mrmd-fg-muted, #666);
}

.mrmd-statusbar__dot--error {
  background: var(--mrmd-error, #f44336);
}

.mrmd-statusbar__dot--starting {
  background: var(--mrmd-warning, #ff9800);
  animation: mrmd-statusbar-pulse 1s ease-in-out infinite;
}

@keyframes mrmd-statusbar-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Separator */
.mrmd-statusbar__separator {
  width: 1px;
  height: 14px;
  background: var(--mrmd-statusbar-separator, var(--mrmd-border, #333));
  margin: 0 2px;
}

/* Spacer (pushes remaining items to the right) */
.mrmd-statusbar__spacer {
  flex: 1;
}

/* Warning badge for outside-project files */
.mrmd-statusbar__warning {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: var(--mrmd-warning, #ff9800);
  color: #000;
  border-radius: 3px;
  font-size: 10px;
  font-weight: bold;
}
`;

// =============================================================================
// MENU STYLES
// =============================================================================

export const menuStyles = `
/* Dropdown Menu */
.mrmd-menu {
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  max-width: 320px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--mrmd-menu-bg, var(--mrmd-popup-bg, #252526));
  border: 1px solid var(--mrmd-menu-border, var(--mrmd-border, #454545));
  border-radius: 6px;
  box-shadow: var(--mrmd-shadow-lg, 0 8px 32px rgba(0, 0, 0, 0.4));
  padding: 4px 0;
  font-family: var(--mrmd-ui-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: var(--mrmd-ui-font-size, 13px);
}

.mrmd-menu--hidden {
  display: none;
}

/* Menu Header */
.mrmd-menu__header {
  padding: 8px 12px 6px;
  font-size: var(--mrmd-ui-font-size-sm, 11px);
  font-weight: 600;
  color: var(--mrmd-fg-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Menu Item */
.mrmd-menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  cursor: pointer;
  color: var(--mrmd-fg, #ccc);
  transition: background-color 0.1s ease;
}

.mrmd-menu__item:hover {
  background: var(--mrmd-menu-hover, var(--mrmd-hover-bg, rgba(255, 255, 255, 0.08)));
}

.mrmd-menu__item--active {
  background: var(--mrmd-menu-active, var(--mrmd-selection-bg, rgba(0, 122, 204, 0.3)));
}

.mrmd-menu__item--disabled {
  opacity: 0.5;
  cursor: default;
}

.mrmd-menu__item--disabled:hover {
  background: transparent;
}

/* Menu Item Parts */
.mrmd-menu__item-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.mrmd-menu__item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mrmd-menu__item-shortcut {
  flex-shrink: 0;
  font-size: var(--mrmd-ui-font-size-sm, 11px);
  color: var(--mrmd-fg-muted, #666);
}

.mrmd-menu__item-check {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  color: var(--mrmd-accent, #007acc);
}

/* Menu Divider */
.mrmd-menu__divider {
  height: 1px;
  background: var(--mrmd-menu-divider, var(--mrmd-border, #333));
  margin: 4px 8px;
}

/* Menu Info Row (readonly info display) */
.mrmd-menu__info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  color: var(--mrmd-fg-muted, #888);
  font-size: var(--mrmd-ui-font-size-sm, 11px);
}

.mrmd-menu__info-label {
  flex-shrink: 0;
}

.mrmd-menu__info-value {
  flex: 1;
  text-align: right;
  color: var(--mrmd-fg, #ccc);
}

/* File browser in menu */
.mrmd-menu__file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  cursor: pointer;
  color: var(--mrmd-fg, #ccc);
}

.mrmd-menu__file:hover {
  background: var(--mrmd-menu-hover, var(--mrmd-hover-bg, rgba(255, 255, 255, 0.08)));
}

.mrmd-menu__file--current {
  background: var(--mrmd-menu-active, var(--mrmd-selection-bg, rgba(0, 122, 204, 0.2)));
}

.mrmd-menu__file-icon {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.mrmd-menu__file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mrmd-menu__file-indicator {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--mrmd-accent, #007acc);
}
`;

// =============================================================================
// DIALOG STYLES
// =============================================================================

export const dialogStyles = `
/* Dialog Overlay */
.mrmd-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1001;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.mrmd-dialog-overlay--hidden {
  display: none;
}

/* Dialog */
.mrmd-dialog {
  background: var(--mrmd-dialog-bg, var(--mrmd-popup-bg, #252526));
  border: 1px solid var(--mrmd-dialog-border, var(--mrmd-border, #454545));
  border-radius: 8px;
  box-shadow: var(--mrmd-shadow-xl, 0 16px 48px rgba(0, 0, 0, 0.5));
  min-width: 320px;
  max-width: 560px;
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  font-family: var(--mrmd-ui-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: var(--mrmd-ui-font-size, 13px);
  color: var(--mrmd-fg, #ccc);
}

/* Dialog Header */
.mrmd-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--mrmd-border, #333);
}

.mrmd-dialog__title {
  font-weight: 600;
  font-size: 14px;
}

.mrmd-dialog__close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--mrmd-fg-muted, #888);
  cursor: pointer;
  border-radius: 4px;
  font-size: 18px;
}

.mrmd-dialog__close:hover {
  background: var(--mrmd-hover-bg, rgba(255, 255, 255, 0.08));
  color: var(--mrmd-fg, #ccc);
}

/* Dialog Body */
.mrmd-dialog__body {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

/* Dialog Footer */
.mrmd-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--mrmd-border, #333);
}

/* Input */
.mrmd-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--mrmd-input-bg, var(--mrmd-bg, #1e1e1e));
  border: 1px solid var(--mrmd-input-border, var(--mrmd-border, #454545));
  border-radius: 4px;
  color: var(--mrmd-fg, #ccc);
  font-family: inherit;
  font-size: inherit;
  outline: none;
}

.mrmd-input:focus {
  border-color: var(--mrmd-accent, #007acc);
  box-shadow: 0 0 0 1px var(--mrmd-accent, #007acc);
}

.mrmd-input::placeholder {
  color: var(--mrmd-fg-muted, #666);
}

/* Label */
.mrmd-label {
  display: block;
  margin-bottom: 6px;
  font-size: var(--mrmd-ui-font-size-sm, 12px);
  color: var(--mrmd-fg-muted, #888);
}

/* Button */
.mrmd-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--mrmd-button-bg, #3c3c3c);
  border: 1px solid var(--mrmd-button-border, #5a5a5a);
  border-radius: 4px;
  color: var(--mrmd-fg, #ccc);
  font-family: inherit;
  font-size: var(--mrmd-ui-font-size, 13px);
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.mrmd-button:hover {
  background: var(--mrmd-button-hover, #4a4a4a);
}

.mrmd-button:active {
  background: var(--mrmd-button-active, #555);
}

.mrmd-button--primary {
  background: var(--mrmd-accent, #007acc);
  border-color: var(--mrmd-accent, #007acc);
  color: #fff;
}

.mrmd-button--primary:hover {
  background: var(--mrmd-accent-hover, #0098ff);
}

.mrmd-button--danger {
  background: var(--mrmd-error, #d32f2f);
  border-color: var(--mrmd-error, #d32f2f);
  color: #fff;
}

.mrmd-button--danger:hover {
  background: #e53935;
}
`;

// =============================================================================
// FILE PICKER STYLES
// =============================================================================

export const filePickerStyles = `
/* File Picker */
.mrmd-filepicker {
  min-height: 300px;
}

/* Path bar */
.mrmd-filepicker__path {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--mrmd-border, #333);
  overflow-x: auto;
  white-space: nowrap;
}

.mrmd-filepicker__path-segment {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
  color: var(--mrmd-fg-muted, #888);
}

.mrmd-filepicker__path-segment:hover {
  background: var(--mrmd-hover-bg, rgba(255, 255, 255, 0.08));
  color: var(--mrmd-fg, #ccc);
}

.mrmd-filepicker__path-separator {
  color: var(--mrmd-fg-muted, #666);
}

/* File list */
.mrmd-filepicker__list {
  max-height: 280px;
  overflow-y: auto;
}

.mrmd-filepicker__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  cursor: pointer;
  border-radius: 4px;
}

.mrmd-filepicker__item:hover {
  background: var(--mrmd-hover-bg, rgba(255, 255, 255, 0.05));
}

.mrmd-filepicker__item--selected {
  background: var(--mrmd-selection-bg, rgba(0, 122, 204, 0.2));
}

.mrmd-filepicker__item-icon {
  flex-shrink: 0;
  width: 20px;
  text-align: center;
  font-size: 16px;
}

.mrmd-filepicker__item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mrmd-filepicker__item-info {
  flex-shrink: 0;
  font-size: var(--mrmd-ui-font-size-sm, 11px);
  color: var(--mrmd-fg-muted, #666);
}

/* Empty state */
.mrmd-filepicker__empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--mrmd-fg-muted, #666);
}

/* New file input */
.mrmd-filepicker__new {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--mrmd-border, #333);
  margin-top: 8px;
}

.mrmd-filepicker__new-input {
  flex: 1;
}
`;

// =============================================================================
// ALL STYLES COMBINED
// =============================================================================
// STUDIO STYLES
// =============================================================================

export const studioStyles = `
/* Studio Container */
.mrmd-studio {
  position: relative;
}

/* Editor Container */
.mrmd-studio__editor {
  position: relative;
}

/* Loading State */
.mrmd-studio__editor--loading {
  pointer-events: none;
}

.mrmd-studio__editor--loading::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--mrmd-bg, #1e1e1e);
  opacity: 0.7;
  z-index: 100;
  animation: mrmd-studio-fade-in 0.15s ease;
}

@keyframes mrmd-studio-fade-in {
  from { opacity: 0; }
  to { opacity: 0.7; }
}

/* Loading spinner (optional, can be added via pseudo or actual element) */
.mrmd-studio__editor--loading::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 24px;
  height: 24px;
  margin: -12px 0 0 -12px;
  border: 2px solid var(--mrmd-border, #333);
  border-top-color: var(--mrmd-accent, #007acc);
  border-radius: 50%;
  z-index: 101;
  animation: mrmd-studio-spin 0.8s linear infinite;
}

@keyframes mrmd-studio-spin {
  to { transform: rotate(360deg); }
}
`;

// =============================================================================
// COMBINED STYLES
// =============================================================================

export const shellStyles = `
${statusBarStyles}
${menuStyles}
${dialogStyles}
${filePickerStyles}
${studioStyles}
`;

// =============================================================================
// STYLE INJECTION
// =============================================================================

let stylesInjected = false;

/**
 * Inject shell styles into the document
 */
export function injectShellStyles() {
  if (stylesInjected) return;

  const style = document.createElement('style');
  style.id = 'mrmd-shell-styles';
  style.textContent = shellStyles;
  document.head.appendChild(style);

  stylesInjected = true;
}
