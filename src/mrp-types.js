/**
 * MRMD Runtime Protocol (MRP) Types
 *
 * JSDoc type definitions for the MRP protocol.
 * See PROTOCOL.md for full specification.
 *
 * @module mrp-types
 */

// #region CAPABILITIES

/**
 * Runtime capabilities - what features are supported
 * @typedef {Object} Capabilities
 * @property {string} runtime - Runtime identifier: "ipython", "node", "browser-js", "bash"
 * @property {string} version - Runtime version: "3.11.4", "20.10.0"
 * @property {string[]} languages - Supported language identifiers: ["python", "py", "python3"]
 * @property {CapabilityFeatures} features - What this runtime can do
 * @property {string} [lspFallback] - WebSocket URL for fallback LSP
 * @property {RuntimeEnvironment} [environment] - Execution environment info
 */

/**
 * Feature flags
 * @typedef {Object} CapabilityFeatures
 * @property {boolean} execute - Run code and return result (always true)
 * @property {boolean} executeStream - Stream output via SSE
 * @property {boolean} interrupt - Cancel running execution
 * @property {boolean} complete - Tab completion from the live runtime namespace
 * @property {boolean} inspect - Get symbol info (signature, docs, source)
 * @property {boolean} hover - Quick value/type preview
 * @property {boolean} variables - List variables in namespace
 * @property {boolean} variableExpand - Drill into objects
 * @property {boolean} reset - Clear namespace
 * @property {boolean} isComplete - Check if code is complete statement
 * @property {boolean} format - Format/prettify code
 * @property {boolean} assets - Saves files to disk
 */

/**
 * Execution environment
 * @typedef {Object} RuntimeEnvironment
 * @property {string} cwd - Current working directory
 * @property {string} [executable] - Path to interpreter
 * @property {string} [virtualenv] - Path to virtual environment
 * @property {Object<string, string>} [env] - Environment variables
 */

// #endregion CAPABILITIES


// #region EXECUTION

/**
 * Execute request
 * @typedef {Object} ExecuteRequest
 * @property {string} code - Code to execute
 * @property {boolean} [storeHistory] - Add to execution history (default: true)
 * @property {boolean} [silent] - Suppress output (default: false)
 * @property {string} [assetDir] - Where to save figures/assets
 * @property {string} [execId] - Links assets to this execution
 * @property {string} [cellId] - Links to document cell
 * @property {CellMeta} [cellMeta] - Metadata from code fence
 */

/**
 * Cell metadata from code fence attributes
 * @typedef {Object} CellMeta
 * @property {boolean} [global] - JS: add to global scope
 * @property {boolean} [async] - JS: allow top-level await
 * @property {'block'|'inline'} [display] - Output display mode
 */

/**
 * Execution result
 * @typedef {Object} ExecuteResult
 * @property {boolean} success - Whether execution succeeded
 * @property {string} stdout - Standard output
 * @property {string} stderr - Standard error
 * @property {string} [result] - Repr of return value
 * @property {ExecuteError} [error] - Error info if failed
 * @property {DisplayData[]} [displayData] - Rich outputs
 * @property {Asset[]} [assets] - Files saved to disk
 * @property {number} [executionCount] - Execution number
 * @property {number} [duration] - Execution time in ms
 * @property {string[]} [imports] - Detected imports (for UV export)
 */

/**
 * Execution error
 * @typedef {Object} ExecuteError
 * @property {string} type - Error type: "NameError", "SyntaxError"
 * @property {string} message - Error message
 * @property {string[]} [traceback] - Full traceback lines
 * @property {number} [line] - Line number in cell
 * @property {number} [column] - Column number
 */

/**
 * Rich display output (Jupyter-style)
 * @typedef {Object} DisplayData
 * @property {DisplayMimeBundle} data - MIME type -> content
 * @property {Object<string, any>} [metadata] - Display metadata
 */

/**
 * MIME bundle for rich output
 * @typedef {Object} DisplayMimeBundle
 * @property {string} [text/plain] - Plain text
 * @property {string} [text/html] - HTML
 * @property {string} [text/markdown] - Markdown
 * @property {string} [image/png] - Base64 PNG
 * @property {string} [image/svg+xml] - SVG
 * @property {any} [application/json] - JSON data
 */

/**
 * Saved asset (figure, HTML file, etc.)
 * @typedef {Object} Asset
 * @property {string} path - Absolute path or relative to assetDir
 * @property {string} [url] - URL for serving: /mrp/v1/assets/...
 * @property {string} mimeType - MIME type
 * @property {'image'|'html'|'data'|'file'} assetType - Asset category
 * @property {number} [size] - File size in bytes
 */

// #endregion EXECUTION

// #region STREAMING

/**
 * SSE stream event
 * @typedef {StartEvent|StdoutEvent|StderrEvent|DisplayEvent|AssetEvent|ResultEvent|ErrorEvent|DoneEvent} StreamEvent
 */

/**
 * @typedef {Object} StartEvent
 * @property {'start'} event
 * @property {{execId: string, timestamp: string}} data
 */

/**
 * @typedef {Object} StdoutEvent
 * @property {'stdout'} event
 * @property {{content: string, accumulated: string}} data
 */

/**
 * @typedef {Object} StderrEvent
 * @property {'stderr'} event
 * @property {{content: string, accumulated: string}} data
 */

/**
 * @typedef {Object} DisplayEvent
 * @property {'display'} event
 * @property {DisplayData} data
 */

/**
 * @typedef {Object} AssetEvent
 * @property {'asset'} event
 * @property {Asset} data
 */

/**
 * @typedef {Object} ResultEvent
 * @property {'result'} event
 * @property {ExecuteResult} data
 */

/**
 * @typedef {Object} ErrorEvent
 * @property {'error'} event
 * @property {ExecuteError} data
 */

/**
 * @typedef {Object} DoneEvent
 * @property {'done'} event
 * @property {{}} data
 */

/**
 * @typedef {Object} StdinRequestEvent
 * @property {'stdin_request'} event
 * @property {StdinRequest} data
 */

/**
 * Stdin request - runtime needs user input
 * @typedef {Object} StdinRequest
 * @property {string} prompt - Text to display before input cursor
 * @property {boolean} password - If true, hide typed characters
 * @property {string} execId - Links to current execution
 */

/**
 * Send input request
 * @typedef {Object} SendInputRequest
 * @property {string} execId - Execution ID waiting for input
 * @property {string} text - User input (include \n if submitting)
 */

/**
 * Send input response
 * @typedef {Object} SendInputResult
 * @property {boolean} accepted - Whether input was accepted
 * @property {string} [error] - Error message if not accepted
 */

// #endregion STREAMING

// #region COMPLETION

/**
 * Completion request
 * @typedef {Object} CompleteRequest
 * @property {string} code - Code in cell
 * @property {number} cursor - Cursor position (character offset)
 * @property {'invoked'|'character'|'incomplete'} [triggerKind] - What triggered completion
 * @property {string} [triggerCharacter] - Character that triggered (".", "[", etc.)
 */

/**
 * Completion result
 * @typedef {Object} CompleteResult
 * @property {Completion[]} matches - Completion items
 * @property {number} cursorStart - Where token starts
 * @property {number} cursorEnd - Where token ends
 * @property {'runtime'|'lsp'|'static'} source - Where completions came from
 */

/**
 * Single completion item
 * @typedef {Object} Completion
 * @property {string} label - Display text: "append"
 * @property {string} [insertText] - Text to insert (if different from label)
 * @property {CompletionKind} kind - Item kind
 * @property {string} [detail] - Short info: "(item) -> None"
 * @property {string} [documentation] - Longer documentation
 * @property {string} [valuePreview] - Runtime: actual value preview
 * @property {string} [type] - Type string
 * @property {string} [sortText] - For sorting
 * @property {string} [filterText] - For filtering
 */

/**
 * Completion item kind
 * @typedef {'variable'|'function'|'method'|'property'|'class'|'module'|'keyword'|'constant'|'field'|'value'} CompletionKind
 */

// #endregion COMPLETION

// #region INTROSPECTION

/**
 * Inspect request
 * @typedef {Object} InspectRequest
 * @property {string} code - Code in cell
 * @property {number} cursor - Cursor position
 * @property {0|1|2} [detail] - Detail level: 0=signature, 1=+docs, 2=+source
 */

/**
 * Inspect result
 * @typedef {Object} InspectResult
 * @property {boolean} found - Whether symbol was found
 * @property {'runtime'|'lsp'|'static'} source - Where info came from
 * @property {string} [name] - Symbol name
 * @property {SymbolKind} [kind] - Symbol kind
 * @property {string} [type] - Type string
 * @property {string} [signature] - Function signature
 * @property {string} [docstring] - Documentation
 * @property {string} [sourceCode] - Source code (detail >= 2)
 * @property {string} [file] - File path
 * @property {number} [line] - Line number
 * @property {string} [value] - Current value repr
 * @property {number} [children] - Number of children (for expandable)
 */

/**
 * Symbol kind
 * @typedef {'variable'|'function'|'class'|'module'|'method'|'property'} SymbolKind
 */

/**
 * Hover request
 * @typedef {Object} HoverRequest
 * @property {string} code - Code in cell
 * @property {number} cursor - Cursor position
 */

/**
 * Hover result
 * @typedef {Object} HoverResult
 * @property {boolean} found - Whether symbol was found
 * @property {string} [name] - Symbol name
 * @property {string} [type] - Type string
 * @property {string} [value] - Short value repr
 * @property {string} [signature] - Function signature
 * @property {string} [docstring] - Documentation string
 * @property {string} [documentation] - Documentation (normalized alias)
 */

// #endregion INTROSPECTION

// #region VARIABLES

/**
 * Variables request
 * @typedef {Object} VariablesRequest
 * @property {VariablesFilter} [filter] - Filter options
 */

/**
 * Variables filter
 * @typedef {Object} VariablesFilter
 * @property {string[]} [types] - Only these types: ["DataFrame", "ndarray"]
 * @property {string} [namePattern] - Regex pattern
 * @property {boolean} [excludePrivate] - Filter _names
 */

/**
 * Variables result
 * @typedef {Object} VariablesResult
 * @property {Variable[]} variables - Variable list
 * @property {number} count - Total count
 * @property {boolean} truncated - Whether list was truncated
 */

/**
 * Variable info
 * @typedef {Object} Variable
 * @property {string} name - Variable name
 * @property {string} type - Type name
 * @property {string} value - Short repr
 * @property {string} [size] - Size string: "45.2 KB", "1000 rows"
 * @property {boolean} expandable - Has children to explore
 * @property {number[]} [shape] - Array shape: [100, 5]
 * @property {string} [dtype] - NumPy dtype
 * @property {number} [length] - Collection length
 * @property {string[]} [keys] - First few dict keys
 */

/**
 * Variable detail request
 * @typedef {Object} VariableDetailRequest
 * @property {string[]} [path] - Drill-down path: ["key", "0", "attr"]
 * @property {number} [maxChildren] - Max children to return
 * @property {number} [maxValueLength] - Max chars for value repr
 */

/**
 * Variable detail (extended Variable)
 * @typedef {Object} VariableDetail
 * @property {string} name - Variable name
 * @property {string} type - Type name
 * @property {string} value - Short repr
 * @property {string} [size] - Size string
 * @property {boolean} expandable - Has children
 * @property {number[]} [shape] - Array shape
 * @property {string} [dtype] - NumPy dtype
 * @property {number} [length] - Collection length
 * @property {string[]} [keys] - First few dict keys
 * @property {string} [fullValue] - Complete repr if small enough
 * @property {Variable[]} [children] - Nested items
 * @property {string[]} [methods] - Callable methods
 * @property {string[]} [attributes] - Non-callable attributes
 * @property {boolean} [truncated] - Was value truncated
 */

// #endregion VARIABLES

// #region CODE_ANALYSIS

/**
 * Is-complete request
 * @typedef {Object} IsCompleteRequest
 * @property {string} code - Code to check
 */

/**
 * Is-complete result
 * @typedef {Object} IsCompleteResult
 * @property {'complete'|'incomplete'|'invalid'|'unknown'} status - Completion status
 * @property {string} [indent] - Suggested indent for next line
 */

/**
 * Format request
 * @typedef {Object} FormatRequest
 * @property {string} code - Code to format
 */

/**
 * Format result
 * @typedef {Object} FormatResult
 * @property {string} formatted - Formatted code
 * @property {boolean} changed - Whether code was modified
 */

// #endregion CODE_ANALYSIS

// #region RUNTIME_INTERFACE

/**
 * MRP Runtime interface
 *
 * Extends the base mrmd Runtime with MRP protocol methods.
 *
 * @typedef {Object} MRPRuntime
 * @property {function(string): boolean} supports - Check if runtime handles language
 * @property {function(string, string): Promise<ExecuteResult>} execute - Execute code
 * @property {function(string, string, function): Promise<ExecuteResult>} [executeStreaming] - Streaming execution
 * @property {string} [endpoint] - Base URL for MRP endpoints
 * @property {Capabilities} [capabilities] - Cached capabilities
 * @property {function(): Promise<Capabilities>} getCapabilities - Get capabilities
 * @property {function(CompleteRequest): Promise<CompleteResult>} [complete] - Get completions
 * @property {function(InspectRequest): Promise<InspectResult>} [inspect] - Get symbol info
 * @property {function(HoverRequest): Promise<HoverResult>} [hover] - Get hover tooltip
 * @property {function(string=): Promise<VariablesResult>} [getVariables] - List variables
 * @property {function(string, string=): Promise<VariableDetail>} [getVariableDetail] - Drill into variable
 * @property {function(string=): Promise<void>} [interrupt] - Cancel execution
 * @property {function(string=): Promise<void>} [reset] - Clear namespace
 * @property {function(string): Promise<IsCompleteResult>} [isComplete] - Check if code is complete
 * @property {function(string): Promise<FormatResult>} [format] - Format code
 */

// #endregion RUNTIME_INTERFACE

export {};
