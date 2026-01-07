import { parser } from "../dist/index.js";
import { fileTests } from "@lezer/generator/test";

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));

for (const file of fs.readdirSync(testDir)) {
  if (!/\.txt$/.test(file)) continue;
  const name = (/^[^\.]*/).exec(file)[0];
  describe(name, () => {
    for (
      const { name, run } of fileTests(
        fs.readFileSync(path.join(testDir, file), "utf8"),
        file,
      )
    ) {
      it(name, () => run(parser));
    }
  });
}
