let path = require("path");

const isDevServer = process.env.WEBPACK_DEV_SERVER;

module.exports = {
  mode: "development",

  entry: {
    app: ["./src/index.ts"]
  },

  output: {
    path: path.resolve(__dirname + "/dist"),
    filename: "[name].js"
  },

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
      {
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
      },
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
    inline: true,
    stats: { colors: true }
  }
};

if (isDevServer) {
  module.exports.devtool = "eval-source-map"
}