let path = require("path");

const UglifyJsPlugin = require('uglifyjs-webpack-plugin')
const isDevServer = process.argv[1].indexOf('webpack-dev-server') !== -1;

module.exports = {
  
  entry: {
    app: [
      './src/index.js'
    ]
  },
  
  output: {
    path: path.resolve(__dirname + '/dist'),
    filename: '[name].js',
  },
  
  module: {
    rules: [
      {
        test:    /\.html$/,
        exclude: /node_modules/,
        loader:  'file-loader?name=[name].[ext]',
      },
      {
        test:    /\.elm$/,
        exclude: /node_modules/,
        loader:  'elm-webpack-loader?verbose=true&warn=true',
      }
    ],
    
    noParse: /\.elm$/,
  },
  
  devServer: {
    inline: true,
    stats: { colors: true },
  },
  
  
};

if (!isDevServer) {
  module.exports.plugins = [new UglifyJsPlugin()];
}