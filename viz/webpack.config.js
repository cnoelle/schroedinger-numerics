import CopyPlugin from "copy-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import path from "path";
import pkg from "resolve-typescript-plugin"; // required for importing .ts files as .js files with webpack https://www.npmjs.com/package/resolve-typescript-plugin 
const ResolveTypeScriptPlugin = pkg.default;

export default  {
    entry: "./src/index.ts",
    devtool: "inline-source-map",
    module: {
        rules: [{
            test: /\.tsx?$/,
            use: "ts-loader",
            exclude: /node_modules/
        },{
            test: /\.css$/i,
            use: ["style-loader", "css-loader"],
        }]
    },
    
    resolve: {
        extensions: [".ts", ".js", ".tsx", ".css"],
        //modules: ["src", "node_modules"],
        plugins: [new ResolveTypeScriptPlugin()]
    },
    output: {
        filename: "bundle.js",
        path: path.resolve("./dist"),
        clean: true
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: "./assets", to: "./assets" }
            ]
        }),
        new HtmlWebpackPlugin({
            title: "Schrödinger vis",
            template: "index.html",
            inject: "body",
            scriptLoading: "module"
        })
    ],
    devServer: {
        //contentBase: path.resolve("./src"),
        static: [
            { directory: path.resolve("./dist") },
            { directory: path.resolve("./assets"), publicPath: "/assets"}
        ],
        compress: false,
        port: 8080,
    },
}