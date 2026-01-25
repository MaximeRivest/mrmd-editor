/**
 * @fileoverview Drive - Yjs Document Manager
 *
 * Manages WebSocket connections to mrmd-sync and Yjs document lifecycle.
 * Provides a clean API for opening and switching between documents.
 *
 * Key design decisions:
 * - Each document gets its own Y.Doc and WebsocketProvider (isolation)
 * - Connections are cached for quick switching between recent documents
 * - Proper cleanup when documents are closed
 * - Does NOT manage editor lifecycle (that's Studio's job)
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// =============================================================================
// DRIVE
// =============================================================================

/**
 * @typedef {Object} DocumentHandle
 * @property {Y.Doc} ydoc - Yjs document
 * @property {Y.Text} ytext - Yjs Text for content
 * @property {import('y-websocket').Awareness} awareness - Awareness instance
 * @property {WebsocketProvider} provider - WebSocket provider
 * @property {string} docName - Document name
 * @property {boolean} synced - Whether initial sync is complete
 */

/**
 * @typedef {Object} DriveOptions
 * @property {number} [maxCachedDocs=5] - Maximum number of documents to keep in cache
 * @property {number} [syncTimeout=10000] - Timeout for initial sync (ms)
 * @property {Function} [log] - Logger function
 */

/**
 * Drive manages Yjs document connections.
 *
 * Usage:
 * ```javascript
 * const drive = new Drive('ws://localhost:4444');
 * const handle = await drive.open('my-notebook');
 * // handle.ydoc, handle.ytext, handle.awareness ready to use
 *
 * // Later, switch to another document
 * const handle2 = await drive.open('other-notebook');
 *
 * // Cleanup
 * drive.destroy();
 * ```
 */
export class Drive {
  /**
   * @param {string} syncUrl - WebSocket URL for mrmd-sync
   * @param {DriveOptions} [options]
   */
  constructor(syncUrl, options = {}) {
    /** @type {string} */
    this.syncUrl = syncUrl.replace(/\/$/, ''); // Remove trailing slash

    /** @type {DriveOptions} */
    this.options = {
      maxCachedDocs: 5,
      syncTimeout: 10000,
      log: () => {},
      ...options,
    };

    /**
     * Cache of open documents
     * @type {Map<string, DocumentHandle>}
     */
    this._docs = new Map();

    /**
     * Access order for LRU eviction
     * @type {string[]}
     */
    this._accessOrder = [];

    /**
     * Currently active document
     * @type {string|null}
     */
    this._currentDoc = null;

    /**
     * Whether the drive has been destroyed
     * @type {boolean}
     */
    this._destroyed = false;
  }

  /**
   * Log helper
   * @param {string} level
   * @param {string} message
   * @param {Object} [data]
   */
  _log(level, message, data = {}) {
    this.options.log({ level, message, component: 'drive', ...data });
  }

  /**
   * Open a document, creating connection if needed.
   *
   * @param {string} docName - Document name (room name for mrmd-sync)
   * @returns {Promise<DocumentHandle>}
   * @throws {Error} If connection fails or times out
   */
  async open(docName) {
    if (this._destroyed) {
      throw new Error('Drive has been destroyed');
    }

    // Normalize document name (remove .md extension if present)
    const normalizedName = docName.replace(/\.md$/, '');

    // Check if already open
    if (this._docs.has(normalizedName)) {
      this._log('debug', 'Returning cached document', { doc: normalizedName });
      this._updateAccessOrder(normalizedName);
      return this._docs.get(normalizedName);
    }

    this._log('info', 'Opening document', { doc: normalizedName, syncUrl: this.syncUrl });

    // Create new Y.Doc
    const ydoc = new Y.Doc();

    // Create WebSocket provider
    const provider = new WebsocketProvider(this.syncUrl, normalizedName, ydoc, {
      connect: true,
    });

    // Wait for initial sync
    const synced = await this._waitForSync(provider, normalizedName);

    if (!synced) {
      provider.destroy();
      ydoc.destroy();
      throw new Error(`Timeout waiting for sync: ${normalizedName}`);
    }

    // Create handle
    const handle = {
      ydoc,
      ytext: ydoc.getText('content'),
      awareness: provider.awareness,
      provider,
      docName: normalizedName,
      synced: true,
    };

    // Store in cache
    this._docs.set(normalizedName, handle);
    this._updateAccessOrder(normalizedName);

    // Evict old documents if over limit
    this._evictOldDocs();

    this._log('info', 'Document opened', { doc: normalizedName });

    return handle;
  }

  /**
   * Wait for provider to sync
   * @param {WebsocketProvider} provider
   * @param {string} docName
   * @returns {Promise<boolean>}
   */
  _waitForSync(provider, docName) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this._log('warn', 'Sync timeout', { doc: docName });
        resolve(false);
      }, this.options.syncTimeout);

      // y-websocket 2.x emits 'sync' event with boolean parameter
      const onSync = (isSynced) => {
        if (isSynced) {
          clearTimeout(timeout);
          provider.off('sync', onSync);
          resolve(true);
        }
      };

      // Check if already synced
      if (provider.synced) {
        clearTimeout(timeout);
        resolve(true);
        return;
      }

      provider.on('sync', onSync);
    });
  }

  /**
   * Update LRU access order
   * @param {string} docName
   */
  _updateAccessOrder(docName) {
    const idx = this._accessOrder.indexOf(docName);
    if (idx !== -1) {
      this._accessOrder.splice(idx, 1);
    }
    this._accessOrder.push(docName);
    this._currentDoc = docName;
  }

  /**
   * Evict oldest documents if over cache limit
   */
  _evictOldDocs() {
    while (this._accessOrder.length > this.options.maxCachedDocs) {
      const oldest = this._accessOrder.shift();
      if (oldest && oldest !== this._currentDoc) {
        this.close(oldest);
      } else if (oldest === this._currentDoc) {
        // Don't evict current doc, put it back
        this._accessOrder.push(oldest);
        break;
      }
    }
  }

  /**
   * Close a specific document connection
   * @param {string} docName
   */
  close(docName) {
    const normalizedName = docName.replace(/\.md$/, '');
    const handle = this._docs.get(normalizedName);

    if (!handle) {
      return;
    }

    this._log('info', 'Closing document', { doc: normalizedName });

    // Disconnect provider
    try {
      handle.provider.disconnect();
      handle.provider.destroy();
    } catch (e) {
      this._log('warn', 'Error disconnecting provider', { doc: normalizedName, error: e.message });
    }

    // Destroy Y.Doc
    try {
      handle.ydoc.destroy();
    } catch (e) {
      this._log('warn', 'Error destroying Y.Doc', { doc: normalizedName, error: e.message });
    }

    // Remove from cache
    this._docs.delete(normalizedName);

    // Remove from access order
    const idx = this._accessOrder.indexOf(normalizedName);
    if (idx !== -1) {
      this._accessOrder.splice(idx, 1);
    }

    // Clear current if this was it
    if (this._currentDoc === normalizedName) {
      this._currentDoc = this._accessOrder[this._accessOrder.length - 1] || null;
    }
  }

  /**
   * Get currently active document name
   * @returns {string|null}
   */
  get currentDocument() {
    return this._currentDoc;
  }

  /**
   * Get list of open document names
   * @returns {string[]}
   */
  get openDocuments() {
    return Array.from(this._docs.keys());
  }

  /**
   * Check if a document is open
   * @param {string} docName
   * @returns {boolean}
   */
  isOpen(docName) {
    return this._docs.has(docName.replace(/\.md$/, ''));
  }

  /**
   * Get handle for an open document (without opening it)
   * @param {string} docName
   * @returns {DocumentHandle|null}
   */
  getHandle(docName) {
    return this._docs.get(docName.replace(/\.md$/, '')) || null;
  }

  /**
   * Close all documents and clean up
   */
  destroy() {
    if (this._destroyed) {
      return;
    }

    this._log('info', 'Destroying drive');
    this._destroyed = true;

    // Close all documents
    for (const docName of this._docs.keys()) {
      this.close(docName);
    }

    this._docs.clear();
    this._accessOrder = [];
    this._currentDoc = null;
  }

  /**
   * Update the sync URL for new connections.
   * This closes ALL existing document connections and updates the URL.
   * Use this when switching between projects with different sync servers.
   *
   * @param {string} newSyncUrl - New WebSocket URL for mrmd-sync
   */
  setSyncUrl(newSyncUrl) {
    const normalizedUrl = newSyncUrl.replace(/\/$/, '');

    if (normalizedUrl === this.syncUrl) {
      return; // No change
    }

    this._log('info', 'Changing sync URL', { from: this.syncUrl, to: normalizedUrl });

    // Close all existing connections (they're connected to the old URL)
    for (const docName of Array.from(this._docs.keys())) {
      this.close(docName);
    }

    // Update the URL for new connections
    this.syncUrl = normalizedUrl;

    this._log('info', 'Sync URL updated', { syncUrl: this.syncUrl });
  }

  /**
   * Get the current sync URL
   * @returns {string}
   */
  getSyncUrl() {
    return this.syncUrl;
  }
}

/**
 * Create a Drive instance
 * @param {string} syncUrl
 * @param {DriveOptions} [options]
 * @returns {Drive}
 */
export function createDrive(syncUrl, options) {
  return new Drive(syncUrl, options);
}
