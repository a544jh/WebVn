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