import * as path from "path";

export default {
  get cackleRoot() {
    return path.resolve(__dirname, "..");
  },
  get resources() {
    return path.resolve(__dirname, "../resources");
  },
  get templates() {
    return path.resolve(this.resources, "templates");
  },
  get root() {
    return process.cwd();
  },
  get config() {
    return path.resolve(this.root, "cackle.yml");
  },
  get packages() {
    return path.resolve(this.root, "packages");
  }
};
