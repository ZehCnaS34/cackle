import atlas from "./atlas";
import * as path from "path";
import * as ejs from "ejs";
import { readFileSync } from "fs";

export default {
  loadTemplate(name) {
    return readFileSync(path.resolve(atlas.templates, name), "utf-8");
  },
  cackleFile(bindings = {}) {
    const src = this.loadTemplate("cackle.yml.ejs");
    return ejs.render(src, bindings);
  },
  packageJson(bindings = {}) {
    const src = this.loadTemplate("package.json.ejs");
    return ejs.render(src, bindings);
  },
  tsConfig(bindings = {}) {
    const src = this.loadTemplate("tsconfig.json.ejs");
    return ejs.render(src, bindings);
  }
};
