#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import readline from "node:readline/promises";
import { parser } from "../dist/index.js";

function printNode(input, n, depth, indentUnit = 2) {
  // If node is terminal, show content, else show range
  const content = n.node.firstChild === null
    ? `: ${input.slice(n.from, n.to)}`
    : ` ${n.from}..${n.to}`;
  console.log(" ".repeat(depth * indentUnit) + n.name + content);
}

function printTree(input) {
  const tree = parser.parse(input);
  const cursor = tree.cursor();
  let depth = -1;
  cursor.iterate(
    (node) => {
      printNode(input, node, depth += 1);
      return true;
    },
    () => depth -= 1,
  );
}

async function repl() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let lines = [];
  let prompt = "> ";
  for (;;) {
    const input = await rl.question(prompt);
    if (input != "") {
      lines.push(input);
      prompt = "… ";
    } else if (lines.length > 0) {
      printTree(lines.join("\n"));
      lines = [];
      prompt = "> ";
    }
  }
}

function main() {
  if (process.argv.length < 3) {
    repl();
  } else {
    const path = process.argv[2];
    const input = fs.readFileSync(path, "utf-8");
    printTree(input);
  }
}

main();
