import { exec } from "child_process";

interface Options {
  path?: string;
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
