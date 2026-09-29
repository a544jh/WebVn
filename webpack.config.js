const path = require("path");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");

const isDevServer = process.env.WEBPACK_SERVE;

// What all three builds share: the loaders, and how a module name resolves. **Only the editor's build
// type-checks.** ts-loader reports on every file tsconfig.json takes in, not only the ones a build
// bundles, so the editor's check already covers the player's code; three checks side by side took
// `npm run build` from 16s to 41s and found nothing the first had not. The player builds transpile.
const shared = (typeCheck) => ({
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".pegjs"]
  },

  module: {
    rules: [
      {
        test: /\.html$/,
        exclude: /node_modules/,
        loader: "file-loader",
        options: {name: "[name].[ext]"}
      },
      {
        // `import yaml from "./x.yaml?raw"` - the file's text as a string module, matching vite's
        // native ?raw suffix so a module has one spelling that works in the build and in the vitest
        // projects. See src/types/yamlRaw.d.ts. Dormant: its one user, src/demoStory.ts, is a test
        // fixture neither bundle imports, so vite's own ?raw is the only one exercised.
        resourceQuery: /(\?|&)raw(&|$)/,
        type: "asset/source"
      },
      // may want to handle the theme loading ourselves...
      {
        test: /\.css$/,
        use: [ 'style-loader', 'css-loader' ]
      },
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        options: { transpileOnly: !typeCheck },
        exclude: /node_modules/
      },
      {
        test: /\.pegjs$/,
        loader: 'pegjs-loader'
      }
    ]
  }
});

// zip.js's lib/zip-core-base.js opens with `setDefaultConfiguration({ baseURI: import.meta.url })`,
// and webpack resolves import.meta.url to an absolute file:// path on the machine that built the
// bundle, emitted as a string literal - so a deploy publishes the CI runner's checkout path.
// Nothing reads the value: src/storage/archive.ts pins the `zip-core-custom.js` entry, which sets
// workerURI and wasmURI to null, so no URL is ever resolved against it. Defined away rather than
// left in, because the leak is the point and the value is not. Nothing of our own uses import.meta.
const importMetaUrl = () => new webpack.DefinePlugin({ "import.meta.url": "undefined" });

// The two builds `npm run dev` serves and live-reloads, into dist/.
const served = (typeCheck) => ({
  ...shared(typeCheck),
  mode: "development",
  output: {
    path: path.resolve(__dirname + "/dist"),
    filename: "[name].js"
  },
  ...(isDevServer ? { devtool: "eval-source-map" } : {})
});

// Where the published player is written, and fetched from by Publish. src/publishedFolder.ts's
// PUBLISHED_PLAYER_FOLDER names the same directory.
const publishedPlayer = path.resolve(__dirname + "/dist/published-player");

module.exports = [
  {
    ...served(true),
    name: "editor",
    entry: { app: ["./src/index.ts"] },
    plugins: [
      importMetaUrl(),
      new CopyPlugin({
        patterns: [
          {from: "test-assets"}
        ]
      })
    ],
    // The one dev server, for all three builds. Only this config carries its options: webpack-cli
    // starts a server per config that has them.
    devServer: {
      // The two served builds are emitted into the compilation and served from memory by
      // webpack-dev-middleware (html via file-loader, test-assets via CopyPlugin). The published
      // player is not - see below - so it is served off disk, and that directory is the only thing
      // that is. Unwatched, because a watched static directory reloads every open page when it
      // changes, and the published player's build rewrites it on every rebuild.
      static: { directory: publishedPlayer, publicPath: "/published-player", watch: false, serveIndex: false }
    }
  },
  {
    // The player a page on the dev server plays: player.html beside the demo, and Copy player link.
    ...served(false),
    name: "player",
    entry: { playerIndex: ["./src/playerIndex.ts"] },
    plugins: [importMetaUrl()]
  },
  {
    // **The player Publish copies into every published zip, and the same build whatever the mode.**
    // Always production, and never touched by the dev server: `devServer: false` keeps its live-reload
    // client and hot-update code out, which the dev server otherwise adds to every build it serves -
    // copied into a published folder, that client connected back to the dev server from wherever the
    // folder was opened and, after the next rebuild, reloaded the page forever. The flip side of
    // `devServer: false` is that webpack-dev-middleware does not serve this build or keep it in
    // memory, so it is written to disk even under `npm run dev`, and served from there (above).
    ...shared(false),
    name: "published-player",
    mode: "production",
    entry: { playerIndex: ["./src/playerIndex.ts"] },
    output: {
      path: publishedPlayer,
      filename: "[name].js"
    },
    plugins: [importMetaUrl()],
    devServer: false
  }
];
