let path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

const isDevServer = process.env.WEBPACK_SERVE;

module.exports = {
  mode: "development",

  entry: {
    app: ["./src/index.ts"],
    playerIndex: ["./src/playerIndex.ts"]
  },

  output: {
    path: path.resolve(__dirname + "/dist"),
    filename: "[name].js"
  },

  resolve: {
    extensions: [".tsx", ".ts", ".js", ".pegjs"]
  },

  plugins : [
    new CopyPlugin({
      patterns: [
        {from: "test-assets"}
      ]
    })
  ],

  module: {
    rules: [
      {
        test: /\.html$/,
        exclude: /node_modules/,
        loader: "file-loader",
        options: {name: "[name].[ext]"}
      },
      // "Legacy webpack"
      /*{
        test: /\.(png|jpe?g|gif)$/i,
        loader: "file-loader",
        options: {outputPath: (url, resourcePath, context) => {
          //console.log(url)
          //console.log(resourcePath)
          //console.log(context)
          return path.relative(path.join(context, "test-assets"), resourcePath)
        }, emitFile: true}
      },*/
      // Webpack 5
      /*{
        test: /\.(png|jpe?g|gif)$/i,
        type: "asset/resource",
        generator: {
          filename: (one, two, three) => {
            console.log(one)
            console.log(two)
            console.log(three)
            return one.filename.replace("test-assets/", "")
          }
        }
      },*/
      // may want to handle the theme loading ourselves...
      {
        test: /\.css$/,
        use: [ 'style-loader', 'css-loader' ]
      },
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/
      },
      {
        test: /\.pegjs$/,
        loader: 'pegjs-loader'
      }
    ]
  },

  devServer: {
    // Everything the dev server needs (html via file-loader, test-assets via CopyPlugin)
    // is emitted into the compilation and served from memory by webpack-dev-middleware,
    // so there is nothing to serve off disk. Without this, v4+ would watch a ./public
    // directory that does not exist here.
    static: false
  }
};

if (isDevServer) {
  module.exports.devtool = "eval-source-map"
}