const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');

const srcDir = path.resolve(__dirname, 'src');
const outputDir = process.env.BUILD_OUTPUT_DIR
  ? path.resolve(__dirname, process.env.BUILD_OUTPUT_DIR)
  : path.resolve(__dirname, './dist');
const publicApiBase = process.env.FF_API_BASE || '';

// Find all HTML files in src directory
const htmlFiles = fs.readdirSync(srcDir).filter(file => file.endsWith('.html'));

const htmlPlugins = htmlFiles.map(file => {
  return new HtmlWebpackPlugin({
    template: path.resolve(srcDir, file),
    filename: file,
    inject: 'body',
  });
});

module.exports = {
  entry: './src/index.js',
  output: {
    path: outputDir,
    filename: 'js/bundle.[contenthash].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'images/[hash][ext][query]'
        }
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[hash][ext][query]'
        }
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'styles/[name].[contenthash].css',
    }),
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '' },
      ],
    }),
    new webpack.DefinePlugin({
      __FF_API_BASE__: JSON.stringify(publicApiBase),
    }),
    ...htmlPlugins
  ],
  devServer: {
    static: {
      directory: outputDir,
    },
    compress: true,
    port: 9000,
  },
};
