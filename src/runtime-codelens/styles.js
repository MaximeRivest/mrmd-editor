/**
 * Runtime CodeLens Styles
 *
 * Injects CSS for the runtime CodeLens widget.
 * Uses CSS variables for theming compatibility.
 */

let stylesInjected = false;

const STYLES = `
/* Runtime CodeLens Container */
.cm-runtime-codelens {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  margin: 2px 0 4px 0;
  background: var(--runtime-codelens-bg, rgba(128, 128, 128, 0.08));
  border-radius: 4px;
  font-size: 12px;
  font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
  line-height: 1.4;
  border-left: 3px solid var(--runtime-codelens-border, rgba(128, 128, 128, 0.2));
}

/* Individual runtime row */
.cm-runtime-codelens-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
}

.cm-runtime-codelens-row--all {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--runtime-codelens-divider, rgba(128, 128, 128, 0.15));
}

/* Language label */
.cm-runtime-codelens-label {
  font-weight: 500;
  color: var(--runtime-codelens-label, inherit);
  min-width: 80px;
}

/* Session name badge */
.cm-runtime-codelens-name {
  padding: 1px 6px;
  background: var(--runtime-codelens-badge-bg, rgba(128, 128, 128, 0.15));
  border-radius: 3px;
  font-size: 11px;
  color: var(--runtime-codelens-badge-text, inherit);
  opacity: 0.8;
}

/* Actions container */
.cm-runtime-codelens-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

/* Action buttons */
.cm-runtime-codelens-btn {
  padding: 2px 8px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  background: var(--runtime-codelens-btn-bg, rgba(128, 128, 128, 0.12));
  color: var(--runtime-codelens-btn-text, inherit);
  font-size: 12px;
  font-family: inherit;
  transition: background 0.15s ease, transform 0.1s ease;
}

.cm-runtime-codelens-btn:hover {
  background: var(--runtime-codelens-btn-bg-hover, rgba(128, 128, 128, 0.2));
}

.cm-runtime-codelens-btn:active {
  transform: scale(0.95);
}

/* Start button - slightly emphasized */
.cm-runtime-codelens-btn:first-child:not(.cm-runtime-codelens-btn--restart-all) {
  background: var(--runtime-codelens-btn-start-bg, rgba(34, 197, 94, 0.15));
  color: var(--runtime-codelens-btn-start-text, #22c55e);
}

.cm-runtime-codelens-btn:first-child:not(.cm-runtime-codelens-btn--restart-all):hover {
  background: var(--runtime-codelens-btn-start-bg-hover, rgba(34, 197, 94, 0.25));
}

/* Restart All button */
.cm-runtime-codelens-btn--restart-all {
  width: 100%;
  padding: 4px 8px;
  background: var(--runtime-codelens-btn-restart-all-bg, rgba(128, 128, 128, 0.1));
}

/* Status indicator */
.cm-runtime-codelens-status {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  min-width: 100px;
}

.cm-runtime-codelens-status-text {
  opacity: 0.7;
  font-size: 11px;
}

/* Status dot */
.cm-runtime-codelens-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cm-runtime-codelens-dot--green {
  background: var(--runtime-codelens-dot-green, #22c55e);
  box-shadow: 0 0 4px var(--runtime-codelens-dot-green, #22c55e);
}

.cm-runtime-codelens-dot--yellow {
  background: var(--runtime-codelens-dot-yellow, #eab308);
  animation: pulse 1.5s ease-in-out infinite;
}

.cm-runtime-codelens-dot--gray {
  background: var(--runtime-codelens-dot-gray, #9ca3af);
}

.cm-runtime-codelens-dot--red {
  background: var(--runtime-codelens-dot-red, #ef4444);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Dark theme adjustments */
.cm-editor.cm-dark .cm-runtime-codelens,
.dark .cm-runtime-codelens {
  --runtime-codelens-bg: rgba(255, 255, 255, 0.05);
  --runtime-codelens-border: rgba(255, 255, 255, 0.1);
  --runtime-codelens-divider: rgba(255, 255, 255, 0.1);
  --runtime-codelens-btn-bg: rgba(255, 255, 255, 0.08);
  --runtime-codelens-btn-bg-hover: rgba(255, 255, 255, 0.15);
  --runtime-codelens-badge-bg: rgba(255, 255, 255, 0.1);
}
`;

/**
 * Inject runtime CodeLens styles into the document
 * Safe to call multiple times - will only inject once
 */
export function injectRuntimeCodeLensStyles() {
  if (stylesInjected) return;

  const style = document.createElement('style');
  style.id = 'cm-runtime-codelens-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);

  stylesInjected = true;
}

/**
 * Remove injected styles (for cleanup/testing)
 */
export function removeRuntimeCodeLensStyles() {
  const existing = document.getElementById('cm-runtime-codelens-styles');
  if (existing) {
    existing.remove();
    stylesInjected = false;
  }
}
