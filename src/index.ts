import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { rollup, watch } from "rollup";
import * as webpack from "webpack";
import atlas from "./atlas";
import { Observable, of } from "rxjs";
import babel from "rollup-plugin-babel";
import { link, pack, install } from "./npm";
import { buildTree } from "./tree";
import templates from "./templates";
import { camel } from "./utils";
import chalk from "chalk";
const pkg = require("../package.json");

const createCackleProject = () =>
  buildTree(
    {
      "cackle.yml": templates.cackleFile(),
      packages: {},
      "tsconfig.json": templates.tsConfig()
    },
    process.cwd()
  );

const createPackage = packageName =>
  buildTree(
    {
      src: {
        "index.js": `// ${packageName}`
      },
      lib: {},
      "tsconfig.json": templates.tsConfig(),
      "package.json": templates.packageJson({ packageName })
    },
    path.resolve(atlas.packages, packageName)
  );

interface State {
  packageName: string;
  env: "production" | "development" | "none";
  variant: "app" | "module";
  features: Array<string>;
}

const STATE: State = {
  packageName: null,
  env: "development",
  variant: "module",
  features: []
};

interface PackageDefinition {
  [packageName: string]: {
    buildSystem: BuildSystemName;
    features?: string;
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
      if (!this.manifest.packages) this.manifest.packages = [];
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

class ProfileBuilder {
  buildSystem: BuildSystemName;
  profile: any;

  constructor(buildSystem: BuildSystemName) {
    this.buildSystem = buildSystem;
    this.profile = {};
    switch (buildSystem) {
      case "rollup":
        break;
      case "webpack":
        this.profile = {
          plugins: [
            BabelPlugins.transformRuntime,
            BabelPlugins.addModuleExports,
            BabelPlugins.classProperties
          ],
          presets: [BabelPresets.env]
        };
        break;
      default:
        throw new Error("Unsupported build system");
    }
  }

  react() {
    switch (this.buildSystem) {
      case "webpack":
        if (this.profile.presets) {
          this.profile.presets.push(BabelPresets.react);
        }
        break;
    }
    return this;
  }

  flow() {
    switch (this.buildSystem) {
      case "webpack":
        if (this.profile.presets) {
          this.profile.presets.push(BabelPresets.flow);
        }
        break;
    }
    return this;
  }

  typescript() {
    switch (this.buildSystem) {
      case "webpack":
        if (this.profile.presets) {
          this.profile.presets.push(BabelPresets.typescript);
        }
        break;
    }
    return this;
  }

  build() {
    return this.profile;
  }
}

const BabelPlugins = {
  transformRuntime: "@babel/plugin-transform-runtime",
  addModuleExports: "babel-plugin-add-module-exports",
  classProperties: "@babel/plugin-proposal-class-properties"
};

const BabelPresets = {
  env: "@babel/preset-env",
  flow: "@babel/preset-flow",
  typescript: "@babel/preset-typescript",
  react: "@babel/preset-react"
};

interface Builder {
  name: BuildSystemName;
  watch: (packageName: string) => Observable<any>;
  build: (packageName: string) => Promise<any>;
}

class WebpackBuilder implements Builder {
  name: BuildSystemName;

  static BabelOptions = {
    plugins: [BabelPlugins.transformRuntime, BabelPlugins.addModuleExports],
    presets: [
      [
        BabelPresets.env,
        {
          targets: "> 0.25%, not dead",
          modules: "umd"
        }
      ],
      BabelPresets.flow,
      BabelPresets.typescript,
      BabelPresets.react
    ]
  };

  constructor() {
    this.name = "webpack";
  }

  getConfig(name: string): webpack.Configuration {
    let index = fs
      .readdirSync(path.resolve(atlas.packages, name, "src"))
      .includes("index.ts")
      ? "index.ts"
      : "index.js";

    const entries = [path.resolve(atlas.packages, name, "src", index)];
    if (STATE.variant === "app") entries.unshift("@babel/polyfill");
    const babelOptions = new ProfileBuilder("webpack");

    // NOTE: Wrong. This should be in a the package definition.
    if (
      true ||
      STATE.features.includes("typescript") ||
      STATE.features.includes("ts")
    )
      false && babelOptions.typescript();
    if (true || STATE.features.includes("flow")) babelOptions.flow();
    if (
      true ||
      STATE.features.includes("react") ||
      STATE.features.includes("jsx")
    )
      babelOptions.react();

    console.log(babelOptions);

    return {
      mode: STATE.env,
      context: path.resolve(atlas.packages, name),
      entry: entries,
      output: {
        filename: `index.js`,
        path: path.resolve(atlas.packages, name, "lib"),
        // library: camel(name),
        library: name,
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
              {
                loader: "babel-loader",
                options: babelOptions.build()
              },
              {
                loader: "awesome-typescript-loader"
              }
            ]
          },
          {
            test: /\.js(x)?$/,
            loader: "babel-loader",
            exclude: /node_modules/,
            options: babelOptions.build()
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
      const config = this.getConfig(packageName);
      console.log(config);
      const compiler = webpack(config);

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
  features: string;
}

type Arg = string | number | boolean;

class Command {
  private cmd: string;
  private args: Arg[];
  private configuration: Configuration;

  static parse(minimist: Minimist): Command {
    let [cmd, ...args] = minimist._;
    if (cmd) {
      let command = new Command();
      command.cmd = cmd;
      command.args = args;

      STATE.env = minimist.p ? "production" : "development";
      STATE.env = minimist.env || STATE.env;
      STATE.variant = minimist.variant || STATE.variant;
      STATE.variant = minimist.app ? "app" : STATE.variant;
      STATE.features = minimist.features ? minimist.features.split(",") : [];

      return command;
    } else {
      console.log("Cackle 🤣");
      console.log("A minimal boilerplate webpack mono repo.");
      console.log();
      console.log(chalk.red("Commands:"));
      console.log(
        `\t ${chalk.green("init")} - Bootstrap a directory to support cackle.`
      );
      console.log(
        `\t ${chalk.green(
          "create"
        )} [package-name] - Create a new cackle package.`
      );
      console.log(`\t ${chalk.green("pack")} - Npm pack all cackle packages.`);
      console.log(
        `\t ${chalk.green(
          "build"
        )} [package-name] - Build specified cackle package.`
      );
      console.log(
        `\t ${chalk.green(
          "watch"
        )} [package-name] - Build and watch specified cackle package.`
      );
      console.log();
      return null;
    }
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
      console.log(`Starting :${chalk.yellow(this.cmd)}: command.`);
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
    try {
      const peers = Object.keys(pkg.peerDependencies).join(" ");
      await createCackleProject();
      await install({ packages: peers, saveDev: true });
      await install({ packages: "@babel/runtime", save: true });
    } catch (error) {}
  }

  async link(): Promise<void> {}

  async create(): Promise<void> {
    const [name] = this.query("packageName");
    let packageName = this.packageName(name);

    try {
      await createPackage(packageName);
      this.configuration.addPackage(packageName);
      await this.configuration.updateManifest();

      // const pds = Object.keys(pkg.peerDependencies || {}).join(" ");
      // await install({
      //   path: path.resolve(atlas.packages, packageName),
      //   packages: pds,
      //   saveDev: true
      // });
      // await install({
      //   path: path.resolve(atlas.packages, packageName),
      //   packages: "@babel/runtime",
      //   save: true
      // });
    } catch (error) {}
  }
}

export default async function main(args: Minimist) {
  const command = Command.parse(args);
  if (command) {
    const result = await command.exec();
  }
}
