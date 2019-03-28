import atlas from "./atlas";
import * as path from "path";
import * as R from "ramda";
import * as mkdirp from "mkdirp";
import * as fs from "fs";

const mkdir = function(path) {
  return new Promise((resolve, reject) => {
    mkdirp(path, error => {
      if (error) reject(error);
      else resolve();
    });
  });
};

const mkfile = function(name, value, pth) {
  return new Promise((resolve, reject) => {
    fs.writeFile(path.resolve(pth, name), value, err => {
      if (err) reject();
      else resolve();
    });
  });
};

export async function buildTree(def, basePath = "./name") {
  await mkdir(basePath);

  for (const key in def) {
    const value = def[key];
    switch (typeof def[key]) {
      case "string": // create file
        mkfile(key, value, basePath);
        break;
      case "object": // create directory and recurs
        await mkdir(path.resolve(basePath, key));
        buildTree(value, path.resolve(basePath, key));
        break;
      default:
        throw new Error("This is interesting");
    }
  }

  return def;
}
