import { exec } from "child_process";

interface Options {
  path?: string;
  packages?: string;
  saveDev?: boolean;
  save?: boolean;
}

export function link(options?: Options): Promise<string> {
  const { path = null } = { ...options };

  return new Promise((resolve, reject) => {
    let cmd = "npm link";

    if (path) {
      cmd = `cd ${path} && ${cmd}`;
    }

    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(stderr);
      else resolve(stdout);
    });
  });
}

export function pack(options?: Options): Promise<string> {
  const { path = null } = { ...options };

  return new Promise((resolve, reject) => {
    let cmd = "npm pack";

    if (path) {
      cmd = `cd ${path} && ${cmd}`;
    }

    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(stderr);
      else resolve(stdout);
    });
  });
}

export function install(options?: Options): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["npm", "install"];

    if (options.save) args.push("--save");
    if (options.saveDev) args.push("--save-dev");
    if (options.path) {
      args.unshift("cd", options.path, "&&");
    }
    if (options.packages) {
      args.push(options.packages);
    }

    const cmd = args.join(" ");
    console.log("running", cmd);

    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(stderr);
      else resolve(stdout);
    });
  });
}
