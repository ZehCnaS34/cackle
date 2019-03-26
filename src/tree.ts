import atlas from "./atlas";
import * as path from "path";

export function createTree(def, options) {
  const abs = path.resolve(atlas.packages, options.packageName);

  const defs = [def];
  const names = Object.keys(def);

  while (names.length > 0) {
    const name = names.pop();
    const def = defs.pop();

    switch (typeof def[name]) {
      case "string":
      case "object":
    }
  }

}
