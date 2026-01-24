/**
 * AI Client
 *
 * HTTP client for communicating with the mrmd-ai server through the orchestrator.
 */

/**
 * Juice levels for AI quality/cost tradeoff
 */
export const JUICE_LEVELS = {
  QUICK: 0,      // Fast & cheap
  BALANCED: 1,   // Good quality
  DEEP: 2,       // Deep reasoning
  MAXIMUM: 3,    // Best single model
  ULTIMATE: 4,   // Multi-model synthesis
};

export const JUICE_NAMES = ['Quick', 'Balanced', 'Deep', 'Maximum', 'Ultimate'];

/**
 * AI program categories
 */
export const AI_CATEGORIES = {
  FINISH: ['FinishSentencePredict', 'FinishParagraphPredict', 'FinishCodeLinePredict', 'FinishCodeSectionPredict'],
  FIX: ['FixGrammarPredict', 'FixTranscriptionPredict'],
  CORRECT: ['CorrectAndFinishLinePredict', 'CorrectAndFinishSectionPredict'],
  CODE: ['DocumentCodePredict', 'CompleteCodePredict', 'AddTypeHintsPredict', 'ImproveNamesPredict', 'ExplainCodePredict', 'RefactorCodePredict', 'FormatCodePredict', 'ProgramCodePredict'],
  TEXT: ['GetSynonymsPredict', 'GetPhraseSynonymsPredict', 'ReformatMarkdownPredict', 'IdentifyReplacementPredict'],
  DOCUMENT: ['DocumentResponsePredict', 'DocumentSummaryPredict', 'DocumentAnalysisPredict'],
  NOTEBOOK: ['NotebookNamePredict'],
  EDIT: ['EditAtCursorPredict', 'AddressCommentPredict', 'AddressAllCommentsPredict', 'AddressNearbyCommentPredict'],
};

/**
 * AI Client for mrmd-ai server
 */
export class AiClient {
  /**
   * @param {string} baseUrl - Orchestrator base URL (e.g., http://localhost:8080)
   */
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.juiceLevel = JUICE_LEVELS.QUICK;
    this._abortControllers = new Map(); // requestId -> AbortController
  }

  /**
   * Set default juice level
   * @param {number} level - 0-4
   */
  setJuiceLevel(level) {
    this.juiceLevel = Math.max(0, Math.min(4, level));
  }

  /**
   * Get AI server status
   * @returns {Promise<{url: string, managed: boolean, running: boolean, default_juice_level: number}>}
   */
  async getStatus() {
    const response = await fetch(`${this.baseUrl}/api/ai/status`);
    if (!response.ok) {
      throw new Error(`Failed to get AI status: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Get list of available AI programs
   * @returns {Promise<{programs: Array<{name: string, endpoint: string}>}>}
   */
  async getPrograms() {
    const response = await fetch(`${this.baseUrl}/api/ai/programs`);
    if (!response.ok) {
      throw new Error(`Failed to get AI programs: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Execute an AI program
   *
   * @param {string} program - Program name (e.g., 'FinishSentencePredict')
   * @param {Object} params - Program parameters
   * @param {Object} [options] - Options
   * @param {number} [options.juiceLevel] - Override default juice level
   * @param {string} [options.requestId] - Request ID for cancellation
   * @returns {Promise<Object>} - Program result
   */
  async execute(program, params, options = {}) {
    const juiceLevel = options.juiceLevel ?? this.juiceLevel;
    const requestId = options.requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const controller = new AbortController();
    this._abortControllers.set(requestId, controller);

    try {
      const response = await fetch(`${this.baseUrl}/api/ai/${program}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Juice-Level': String(juiceLevel),
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(error.detail || `AI request failed: ${response.status}`);
      }

      return response.json();
    } finally {
      this._abortControllers.delete(requestId);
    }
  }

  /**
   * Execute an AI program with streaming progress
   *
   * @param {string} program - Program name
   * @param {Object} params - Program parameters
   * @param {Object} callbacks - Callbacks for progress events
   * @param {function} [callbacks.onStatus] - Called with status updates
   * @param {function} [callbacks.onModelStart] - Called when a model starts
   * @param {function} [callbacks.onModelComplete] - Called when a model completes
   * @param {function} [callbacks.onResult] - Called with final result
   * @param {function} [callbacks.onError] - Called on error
   * @param {Object} [options] - Options
   * @param {number} [options.juiceLevel] - Override default juice level
   * @param {string} [options.requestId] - Request ID for cancellation
   * @returns {Promise<Object>} - Final result
   */
  async executeStream(program, params, callbacks = {}, options = {}) {
    const juiceLevel = options.juiceLevel ?? this.juiceLevel;
    const requestId = options.requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const controller = new AbortController();
    this._abortControllers.set(requestId, controller);

    try {
      const response = await fetch(`${this.baseUrl}/api/ai/${program}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Juice-Level': String(juiceLevel),
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(error.detail || `AI stream request failed: ${response.status}`);
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            // Parse event type
            const eventType = line.slice(7).trim();
            continue;
          }

          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              // Handle different event types
              if (data.status) {
                callbacks.onStatus?.(data.status, data);
              }
              if (data.model_start) {
                callbacks.onModelStart?.(data.model_start, data);
              }
              if (data.model_complete) {
                callbacks.onModelComplete?.(data.model_complete, data);
              }
              if (data.result || data.completion || data.fixed_text) {
                result = data;
                callbacks.onResult?.(data);
              }
              if (data.error) {
                callbacks.onError?.(new Error(data.error));
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      return result;
    } finally {
      this._abortControllers.delete(requestId);
    }
  }

  /**
   * Cancel a pending request
   * @param {string} requestId - Request ID to cancel
   */
  cancel(requestId) {
    const controller = this._abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this._abortControllers.delete(requestId);
    }
  }

  /**
   * Cancel all pending requests
   */
  cancelAll() {
    for (const controller of this._abortControllers.values()) {
      controller.abort();
    }
    this._abortControllers.clear();
  }

  // ===========================================================================
  // Convenience methods for common operations
  // ===========================================================================

  /**
   * Complete current sentence
   * @param {string} textBeforeCursor - Text before cursor
   * @param {string} localContext - Surrounding context
   * @param {string} [documentContext] - Full document (optional)
   * @param {Object} [options] - Options
   */
  async finishSentence(textBeforeCursor, localContext, documentContext, options = {}) {
    return this.execute('FinishSentencePredict', {
      text_before_cursor: textBeforeCursor,
      local_context: localContext,
      document_context: documentContext,
    }, options);
  }

  /**
   * Complete current paragraph
   */
  async finishParagraph(textBeforeCursor, localContext, documentContext, options = {}) {
    return this.execute('FinishParagraphPredict', {
      text_before_cursor: textBeforeCursor,
      local_context: localContext,
      document_context: documentContext,
    }, options);
  }

  /**
   * Fix grammar and spelling
   * @param {string} textToFix - Text to fix
   * @param {string} localContext - Surrounding context
   * @param {string} [documentContext] - Full document (optional)
   */
  async fixGrammar(textToFix, localContext, documentContext, options = {}) {
    return this.execute('FixGrammarPredict', {
      text_to_fix: textToFix,
      local_context: localContext,
      document_context: documentContext,
    }, options);
  }

  /**
   * Fix transcription errors (speech-to-text)
   */
  async fixTranscription(textToFix, localContext, documentContext, options = {}) {
    return this.execute('FixTranscriptionPredict', {
      text_to_fix: textToFix,
      local_context: localContext,
      document_context: documentContext,
    }, options);
  }

  /**
   * Add documentation to code
   * @param {string} code - Code to document
   * @param {string} language - Programming language
   * @param {string} localContext - Surrounding context
   */
  async documentCode(code, language, localContext, documentContext, options = {}) {
    return this.execute('DocumentCodePredict', {
      code,
      language,
      local_context: localContext,
      document_context: documentContext,
    }, options);
  }

  /**
   * Add type hints to code
   */
  async addTypeHints(code, language, localContext, documentContext, options = {}) {
    return this.execute('AddTypeHintsPredict', {
      code,
      language,
      local_context: localContext,
      document_context: documentContext,
    }, options);
  }

  /**
   * Improve variable/function names
   */
  async improveNames(code, language, localContext, documentContext, options = {}) {
    return this.execute('ImproveNamesPredict', {
      code,
      language,
      local_context: localContext,
      document_context: documentContext,
    }, options);
  }

  /**
   * Refactor code
   */
  async refactorCode(code, language, localContext, documentContext, options = {}) {
    return this.execute('RefactorCodePredict', {
      code,
      language,
      local_context: localContext,
      document_context: documentContext,
    }, options);
  }

  /**
   * Get synonyms for a word
   * @param {string} text - Word to find synonyms for
   * @param {string} localContext - Surrounding context
   */
  async getSynonyms(text, localContext, options = {}) {
    return this.execute('GetSynonymsPredict', {
      text,
      local_context: localContext,
    }, options);
  }

  /**
   * Continue the document (generate content at end)
   * @param {string} document - Full document content
   */
  async continueDocument(document, options = {}) {
    return this.execute('DocumentResponsePredict', {
      document,
    }, options);
  }

  /**
   * Summarize document
   * @param {string} document - Full document content
   */
  async summarizeDocument(document, options = {}) {
    return this.execute('DocumentSummaryPredict', {
      document,
    }, options);
  }

  /**
   * Generate notebook filename
   * @param {string} document - Document content
   * @param {string} [currentName] - Current filename
   */
  async suggestNotebookName(document, currentName, options = {}) {
    return this.execute('NotebookNamePredict', {
      document,
      current_name: currentName,
    }, options);
  }

  // ===========================================================================
  // Edit methods (Ctrl-K and comments)
  // ===========================================================================

  /**
   * Execute an instruction at cursor position
   * @param {string} textBefore - Text before cursor
   * @param {string} textAfter - Text after cursor
   * @param {string} selection - Selected text (empty if no selection)
   * @param {string} fullDocument - Full document content
   * @param {string} instruction - User's instruction
   */
  async editAtCursor(textBefore, textAfter, selection, fullDocument, instruction, options = {}) {
    return this.execute('EditAtCursorPredict', {
      text_before: textBefore,
      text_after: textAfter,
      selection,
      full_document: fullDocument,
      instruction,
    }, options);
  }

  /**
   * Address a single comment
   * @param {string} fullDocument - Full document content
   * @param {string} commentText - Comment text content
   * @param {string} contextBefore - Text before comment
   * @param {string} contextAfter - Text after comment
   * @param {string} commentRaw - Raw comment including markers
   */
  async addressComment(fullDocument, commentText, contextBefore, contextAfter, commentRaw, options = {}) {
    return this.execute('AddressCommentPredict', {
      full_document: fullDocument,
      comment_text: commentText,
      comment_context_before: contextBefore,
      comment_context_after: contextAfter,
      comment_raw: commentRaw,
    }, options);
  }

  /**
   * Address all comments in document
   * @param {string} fullDocument - Full document content
   * @param {Array<{text: string, context_before: string, context_after: string}>} comments - Comments info
   */
  async addressAllComments(fullDocument, comments, options = {}) {
    return this.execute('AddressAllCommentsPredict', {
      full_document: fullDocument,
      comments,
    }, options);
  }

  /**
   * Address comment nearest to cursor
   * @param {string} fullDocument - Full document content
   * @param {string} cursorContextBefore - Text before cursor
   * @param {string} cursorContextAfter - Text after cursor
   * @param {{text: string, context_before: string, context_after: string}} nearbyComment - Nearby comment info
   * @param {string} nearbyCommentRaw - Raw comment including markers
   */
  async addressNearbyComment(fullDocument, cursorContextBefore, cursorContextAfter, nearbyComment, nearbyCommentRaw, options = {}) {
    return this.execute('AddressNearbyCommentPredict', {
      full_document: fullDocument,
      cursor_context_before: cursorContextBefore,
      cursor_context_after: cursorContextAfter,
      nearby_comment: nearbyComment,
      nearby_comment_raw: nearbyCommentRaw,
    }, options);
  }
}

/**
 * Create an AI client
 * @param {string} baseUrl - Orchestrator base URL
 * @returns {AiClient}
 */
export function createAiClient(baseUrl) {
  return new AiClient(baseUrl);
}
