import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { rollup, watch } from "rollup";
import * as webpack from "webpack";
import { Observable, of, config } from "rxjs";
import babel from "rollup-plugin-babel";
import { link, pack } from "./npm";

const packageTree = {
  "src": {
    "index.js": ""
  },
  "lib": {},
  "package.json": ""
}

function camel(str: string) {
  return str.replace(/([a-zA-Z])\-([a-zA-Z])/g, function(_, ...strings) {
    const [a, b] = strings;
    return a + b.toUpperCase();
  });
}

function templatePackage(name) {
  return `{
  "name": "${name}",
  "version": "1.0.0",
  "description": "",
  "main": "lib/index.js",
  "directories": {
    "lib": "lib"
  },
  "scripts": {
  },
  "keywords": [],
  "author": "",
  "license": "ISC"
}`;
}

interface State {
  packageName: string;
  env: "production" | "development" | "none";
  variant: "app" | "module";
}

const STATE: State = {
  packageName: null,
  env: "development",
  variant: "module"
};

const atlas = {
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

interface PackageDefinition {
  [packageName: string]: {
    buildSystem: BuildSystemName;
    public?: boolean;
  };
}

interface CackleFile {
  packages: (string | PackageDefinition)[];
  version?: string;
  prefix: string;
}

const packageName = (pkg: string | PackageDefinition) => {
  if (typeof pkg === "string") {
    return pkg;
  } else {
    return Object.keys(pkg)[0];
  }
};

class Configuration {
  private manifest: CackleFile;

  static defaultConfig(name: string): PackageDefinition {
    return {
      [name]: {
        buildSystem: "webpack"
      }
    };
  }

  constructor() {
    this.loadManifest();
  }

  get packages() {
    return this.manifest.packages;
  }

  get prefix() {
    return this.manifest.prefix || "ckl";
  }

  addPackage(pkgName: string) {
    this.manifest.packages.push(pkgName);
  }

  loadManifest() {
    try {
      this.manifest = yaml.safeLoad(fs.readFileSync(atlas.config, "utf-8"));
    } catch (error) {
      console.log("Failed to load manifest");
    }
  }

  updateManifest() {
    return new Promise((resolve, reject) => {
      try {
        fs.writeFile(atlas.config, yaml.safeDump(this.manifest), () => {
          resolve();
        });
        this.manifest = yaml.safeLoad(fs.readFileSync(atlas.config, "utf-8"));
      } catch (error) {
        reject("Failed to update cackle manifest");
      }
    });
  }

  getPackageConfiguration(name: string): PackageDefinition {
    const configOrName = this.manifest.packages.find((value, index) => {
      if (typeof value === "string") {
        if (value === name) return true;
      } else if (typeof value === "object") {
        let v = Object.keys(value)[0];
        if (value[v] != null && name === v) return true;
      }
    });

    if (typeof configOrName === "string")
      return Configuration.defaultConfig(configOrName);
    return configOrName;
  }
}

type BuildSystemName = "webpack" | "rollup";

interface Builder {
  name: BuildSystemName;
  watch: (packageName: string) => Observable<any>;
  build: (packageName: string) => Promise<any>;
}

class WebpackBuilder implements Builder {
  name: BuildSystemName;
  constructor() {
    this.name = "webpack";
  }

  getConfig(name: string): webpack.Configuration {
    let index = fs
      .readdirSync(path.resolve(atlas.packages, name))
      .includes("index.ts")
      ? "index.ts"
      : "index.js";

    const entries = [path.resolve(atlas.packages, name, index)];
    if (STATE.variant === "app") entries.unshift("@babel/polyfill");

    console.log(entries);

    return {
      mode: STATE.env,
      entry: entries,
      output: {
        filename: `index.js`,
        path: path.resolve(atlas.packages, name, "lib"),
        library: camel(name),
        libraryTarget: "umd",
        umdNamedDefine: true,
        globalObject: "typeof self !== 'undefined' ? self : this"
      },
      plugins: [new webpack.ProgressPlugin()],
      resolve: {
        extensions: [".tsx", ".ts", ".js"]
      },
      module: {
        rules: [
          {
            test: /\.ts(x)?$/,
            exclude: /node_modules/,
            use: [
              // {
              //   loader: "babel-loader",
              //   options: {
              //     plugins: ["@babel/plugin-transform-runtime"],
              //     presets: [
              //       [
              //         "@babel/preset-env",
              //         {
              //           targets: "> 0.25%, not dead",
              //           modules: "umd"
              //         }
              //       ],
              //       "@babel/preset-typescript",
              //       "@babel/preset-react",
              //     ]
              //   }
              // },
              {
                loader: "awesome-typescript-loader",
              }
            ]
          },
          {
            test: /\.js(x)?$/,
            loader: "babel-loader",
            exclude: /node_modules/,
            options: {
              presets: [
                "@babel/preset-env",
                "@babel/preset-react",
                "@babel/preset-flow"
              ],
              plugins: ["@babel/plugin-transform-runtime", "add-module-exports"]
            }
          }
        ]
      }
    };
  }

  watch(packageName: string): Observable<any> {
    return new Observable(observer => {
      function handler(err: Error, stats: webpack.Stats) {
        if (err) {
          observer.error(err);
        } else {
          observer.next(stats);
        }
      }
      const config = this.getConfig(packageName);
      console.log(config);
      const compiler = webpack(config);

      compiler.watch({ aggregateTimeout: 300 }, handler);
    });
  }

  build(packageName: string): Promise<webpack.Stats> {
    return new Promise((resolve, reject) => {
      function handler(err: Error, stats: webpack.Stats) {
        if (err) {
          reject(err);
        } else {
          resolve(stats);
        }
      }
      const compiler = webpack(this.getConfig(packageName));

      compiler.run(handler);
    });
  }
}

class RollupBuilder implements Builder {
  name: BuildSystemName;

  constructor() {
    this.name = "rollup";
  }

  watch(packageName: string): Observable<string> {
    return of("hi");
  }

  build(packageName: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const bundle = await rollup({
        plugins: [
          babel({
            exclude: "node_modules/**"
          })
        ],
        input: path.resolve(atlas.packages, packageName, "index.js")
      });

      const { output } = await bundle.generate({
        dir: path.resolve(atlas.packages, packageName, "dist"),
        format: "cjs"
      });

      await bundle.write({
        dir: path.resolve(atlas.packages, packageName, "dist"),
        format: "cjs"
      });
    });
  }
}

class Package {
  name: string;
  configuration: Configuration;

  constructor(name: string) {
    this.name = name;
    this.configuration = new Configuration();
  }

  getConfiguration() {
    return this.configuration.getPackageConfiguration(this.name);
  }

  getBuilder(name: BuildSystemName): Builder {
    switch (name) {
      case "webpack":
        return new WebpackBuilder();
      case "rollup":
        return new RollupBuilder();
      default:
        throw new Error(`${name} is an unsupported build system.`);
    }
  }

  async watch() {
    let { [this.name]: config } = this.getConfiguration();
    const builder = this.getBuilder(config.buildSystem);

    return new Promise((resolve, reject) => {
      const unsubscribe = builder.watch(this.name).subscribe({
        complete: resolve,
        error: reject,
        next: stats => {
          console.log(stats.toString({ colors: true }));
        }
      });
    });
  }

  async build() {
    let { [this.name]: config } = this.getConfiguration();
    const builder = this.getBuilder(config.buildSystem);

    builder.build(this.name).then(stats => {
      console.log(
        stats.toString({
          colors: true
        })
      );
    });
  }
}

interface Minimist {
  _: string[];
  p: boolean; // Production
  env: "development" | "production";
  variant: "app" | "module";
  app: boolean;
}

type Arg = string | number | boolean;

class Command {
  private cmd: string;
  private args: Arg[];
  private configuration: Configuration;

  static parse(minimist: Minimist): Command {
    let [cmd, ...args] = minimist._;
    let command = new Command();
    command.cmd = cmd;
    command.args = args;
    STATE.env = minimist.p ? "production" : "development";
    STATE.env = minimist.env || STATE.env;
    STATE.variant = minimist.variant || STATE.variant;
    STATE.variant = minimist.app ? "app" : STATE.variant;
    return command;
  }

  constructor() {
    this.configuration = new Configuration();
  }

  private query(...keys: Array<string>) {
    const output = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      STATE[keys[i]] = this.args[i];
      output[i] = this.args[i];
    }
    return output;
  }
  packageName(name: string) {
    if (name.startsWith(this.configuration.prefix)) return name;

    return (
      (this.configuration.prefix ? this.configuration.prefix + "-" : "") + name
    );
  }

  async exec(): Promise<void> {
    try {
      return await this[this.cmd]();
    } catch (error) {}
  }

  async package(): Promise<void> {
    this.configuration.packages.forEach(pkg => {
      const name = packageName(pkg);
      pack({ path: path.resolve(atlas.packages, name) })
        .then(() => {
          console.log(`packaged ${name}.`);
        })
        .catch(error => {
          console.log(`Failed to package ${name}.`, error);
        });
    });
  }

  async build(): Promise<void> {
    const [name] = this.query("packageName");
    const packageName = this.packageName(name);
    new Package(packageName).build();
  }

  async watch(): Promise<void> {
    await Promise.all(
      this.args.map(name =>
        new Package(this.packageName(name as string)).watch()
      )
    );
  }

  async bootstrap(): Promise<void> {
    this.configuration.packages.forEach(pkg => {
      const name = packageName(pkg);
      link({ path: path.resolve(atlas.packages, name) })
        .then(() => {
          console.log(`Bootstrapped ${name}.`);
        })
        .catch(() => {
          console.log(`Failed to bootstrap ${name}.`);
        });
    });
  }

  async init(): Promise<void> {
    const [name] = this.query("packageName");
    let packageName = this.packageName(name);

    try {
      fs.mkdirSync(path.resolve(atlas.packages, packageName));
      fs.writeFile(
        path.resolve(atlas.packages, packageName, "package.json"),
        templatePackage(packageName),
        "utf-8",
        err => {}
      );
      fs.writeFile(
        path.resolve(atlas.packages, packageName, "index.js"),
        "",
        "utf-8",
        err => {}
      );
      this.configuration.addPackage(packageName);
      await this.configuration.updateManifest();
    } catch (error) {}
  }
}

export default async function main(args: Minimist) {
  const command = Command.parse(args);
  const result = await command.exec();
  // console.log(result.unwrap());
}
