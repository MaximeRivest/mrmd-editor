/**
 * @fileoverview Reactive config proxy
 *
 * Creates a deeply reactive proxy around config objects.
 * When any property changes (at any depth), handlers are triggered.
 */

/**
 * @typedef {Object} ReactiveConfig
 * @property {Function} _subscribe - Subscribe to changes
 * @property {Function} _unsubscribe - Unsubscribe from changes
 * @property {Function} _getPath - Get value at path
 * @property {Function} _setPath - Set value at path
 * @property {Object} _raw - Get raw (non-proxied) config
 */

/**
 * Change event emitted when config changes
 * @typedef {Object} ConfigChangeEvent
 * @property {string[]} path - Path to changed property (e.g., ['appearance', 'dark'])
 * @property {any} value - New value
 * @property {any} oldValue - Previous value
 * @property {'set' | 'delete'} type - Type of change
 */

/**
 * Create a deeply reactive proxy around a config object
 *
 * @param {Object} target - The config object to make reactive
 * @param {(event: ConfigChangeEvent) => void} [onChange] - Change handler
 * @returns {Object} Proxied config
 */
export function createReactiveConfig(target, onChange) {
  /** @type {Set<(event: ConfigChangeEvent) => void>} */
  const listeners = new Set();

  if (onChange) {
    listeners.add(onChange);
  }

  /**
   * Emit a change event
   * @param {ConfigChangeEvent} event
   */
  function emit(event) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ReactiveConfig] Listener error:', err);
      }
    }
  }

  /**
   * Create a proxy for an object at a given path
   * @param {Object} obj - Object to proxy
   * @param {string[]} path - Current path
   * @returns {Object} Proxied object
   */
  function createProxy(obj, path = []) {
    // Don't proxy null, primitives, or already-proxied objects
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // Don't proxy special objects (functions, dates, etc.)
    if (typeof obj === 'function' || obj instanceof Date || obj instanceof RegExp) {
      return obj;
    }

    // Don't proxy runtime instances (they have their own methods)
    if (obj.type === 'custom' && obj.instance) {
      return obj;
    }

    return new Proxy(obj, {
      get(target, prop, receiver) {
        // Special properties for the reactive system
        if (prop === '_isReactiveConfig') return true;
        if (prop === '_raw') return target;
        if (prop === '_path') return path;

        if (prop === '_subscribe') {
          return (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          };
        }

        if (prop === '_unsubscribe') {
          return (listener) => listeners.delete(listener);
        }

        if (prop === '_getPath') {
          return (pathStr) => getAtPath(target, pathStr.split('.'));
        }

        if (prop === '_setPath') {
          return (pathStr, value) => setAtPath(receiver, pathStr.split('.'), value);
        }

        const value = Reflect.get(target, prop, receiver);

        // Recursively proxy nested objects
        if (value !== null && typeof value === 'object' && !value._isReactiveConfig) {
          return createProxy(value, [...path, String(prop)]);
        }

        return value;
      },

      set(target, prop, value, receiver) {
        const oldValue = target[prop];

        // Don't emit if value hasn't changed
        if (oldValue === value) {
          return true;
        }

        const success = Reflect.set(target, prop, value, receiver);

        if (success) {
          emit({
            path: [...path, String(prop)],
            value,
            oldValue,
            type: 'set'
          });
        }

        return success;
      },

      deleteProperty(target, prop) {
        const oldValue = target[prop];
        const existed = prop in target;
        const success = Reflect.deleteProperty(target, prop);

        if (success && existed) {
          emit({
            path: [...path, String(prop)],
            value: undefined,
            oldValue,
            type: 'delete'
          });
        }

        return success;
      }
    });
  }

  return createProxy(target);
}

/**
 * Get value at a path in an object
 * @param {Object} obj
 * @param {string[]} path
 * @returns {any}
 */
function getAtPath(obj, path) {
  let current = obj;
  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

/**
 * Set value at a path in an object (creates intermediate objects if needed)
 * @param {Object} obj
 * @param {string[]} path
 * @param {any} value
 */
function setAtPath(obj, path, value) {
  if (path.length === 0) return;

  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] === null || current[key] === undefined) {
      current[key] = {};
    }
    current = current[key];
  }

  current[path[path.length - 1]] = value;
}

/**
 * Create a path string from path array
 * @param {string[]} path
 * @returns {string}
 */
export function pathToString(path) {
  return path.join('.');
}

/**
 * Parse a path string to array
 * @param {string} pathStr
 * @returns {string[]}
 */
export function stringToPath(pathStr) {
  return pathStr.split('.');
}

/**
 * Check if a path matches a pattern
 * Patterns can include '*' for single segment wildcard
 *
 * @param {string[]} path - Actual path
 * @param {string} pattern - Pattern like 'appearance.*' or 'runtimes.*.url'
 * @returns {boolean}
 */
export function matchesPattern(path, pattern) {
  const patternParts = pattern.split('.');

  if (patternParts.length !== path.length) {
    // Special case: pattern ends with '**' means match any depth
    if (patternParts[patternParts.length - 1] === '**') {
      const prefix = patternParts.slice(0, -1);
      return path.slice(0, prefix.length).every((p, i) =>
        prefix[i] === '*' || prefix[i] === p
      );
    }
    return false;
  }

  return patternParts.every((part, i) =>
    part === '*' || part === path[i]
  );
}

/**
 * Create a handler that only triggers for specific paths
 *
 * @param {string | string[]} patterns - Path pattern(s) to match
 * @param {(event: ConfigChangeEvent) => void} handler
 * @returns {(event: ConfigChangeEvent) => void}
 */
export function createPathHandler(patterns, handler) {
  const patternList = Array.isArray(patterns) ? patterns : [patterns];

  return (event) => {
    const pathStr = pathToString(event.path);

    for (const pattern of patternList) {
      if (matchesPattern(event.path, pattern) || pathStr === pattern) {
        handler(event);
        return;
      }
    }
  };
}

/**
 * Batch multiple changes into a single notification
 *
 * @param {Object} reactiveConfig - The reactive config object
 * @param {() => void} fn - Function that makes multiple changes
 */
export function batchChanges(reactiveConfig, fn) {
  // TODO: Implement batching if needed
  // For now, just run the function (each change emits separately)
  fn();
}
