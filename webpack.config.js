let path = require("path");

const UglifyJsPlugin = require("uglifyjs-webpack-plugin");
const isDevServer = process.argv[1].indexOf("webpack-dev-server") !== -1;

module.exports = {
  entry: {
    app: ["./src/index.ts"]
  },

  output: {
    path: path.resolve(__dirname + "/dist"),
    filename: "[name].js"
  },

  resolve: {
    extensions: [".tsx", ".ts", ".js"]
  },

  devtool: "source-map",

  module: {
    rules: [
      {
        test: /\.html$/,
        exclude: /node_modules/,
        loader: "file-loader?name=[name].[ext]"
      },
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },

  devServer: {
    inline: true,
    stats: { colors: true }
  }
};

if (!isDevServer) {
  module.exports.plugins = [
    new UglifyJsPlugin()
  ];
}
