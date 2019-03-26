import * as path from "path";

export default {
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
