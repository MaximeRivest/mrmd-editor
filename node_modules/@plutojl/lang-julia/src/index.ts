import { NodeProp } from "@lezer/common";
import { parser } from "@plutojl/lezer-julia";
import { continuedIndent, indentNodeProp, LanguageSupport, LRLanguage } from "@codemirror/language";
import * as autocomplete from "@codemirror/autocomplete";

export const juliaLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      indentNodeProp.add({
        IfStatement: continuedIndent({ except: /^\s*(end\b|else\b|elseif\b)/ }),
        TryStatement: continuedIndent({ except: /^\s*(end\b|else\b|finally\b)/ }),
        "Definition CompoundStatement": continuedIndent({ except: /^\s*(end\b)/ }), // node groups

        ExportStatement: continuedIndent(),
        ImportStatement: continuedIndent(),
        ReturnStatement: continuedIndent(),

        Assignment: continuedIndent(),
        BinaryExpression: continuedIndent(),
        TernaryExpression: continuedIndent(),
      }),
    ],
  }),
  languageData: {
    closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`", "'''", '"""', "```"] },
    commentTokens: { line: "#", block: { open: "#=", close: "=#" } },
    indentOnInput: /^\s*(\]|\}|\)|end|else|elseif|catch|finally)$/,
  },
});

function collectKeywords() {
  let keywords = [];
  for (let node of parser.nodeSet.types) {
    let groups = node.prop(NodeProp.group);
    let group = groups != null ? groups[0] : null;
    if (group === "keyword") {
      keywords.push({ label: node.name, type: "keyword" });
    }
  }
  return keywords;
}

export const keywordCompletion = juliaLanguage.data.of({
  autocomplete: autocomplete.completeFromList(collectKeywords()),
});

export type JuliaLanguageConfig = {
  /** Enable keyword completion */
  enableKeywordCompletion?: boolean;
};

const defaultConfig: JuliaLanguageConfig = {
  enableKeywordCompletion: false,
};

export function julia(config: JuliaLanguageConfig = defaultConfig) {
  config = { ...defaultConfig, ...config };
  let extensions = [];
  if (config.enableKeywordCompletion) {
    extensions.push(keywordCompletion);
  }
  return new LanguageSupport(juliaLanguage, extensions);
}
