const path = require('path');
const webpack = require('webpack');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
    plugins: [
        new webpack.ProgressPlugin(),
        new CleanWebpackPlugin(),
    ],
    entry: {
        'video-stream-merger': './src/index.ts',
    },
    output: {
        filename: '[name].js',
        path: path.resolve(process.cwd(), 'dist'),
        library: 'video-stream-merger',
        libraryTarget: 'umd',
        globalObject: 'this'
    },
    //devtool: 'inline-source-map',
    devtool: false,
    mode: 'production',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'awesome-typescript-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        alias: {},
        extensions: ['.tsx', '.ts', '.js']
    },
    performance: {
        hints: false,
        maxEntrypointSize: 512000,
        maxAssetSize: 512000
    }
};

