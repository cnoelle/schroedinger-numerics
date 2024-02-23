import path from "path";
import HtmlWebpackPlugin from "html-webpack-plugin";

export default {
  entry: {
    bundle: "./src/PhaseSpaceWidget.ts",
  },
  devtool: "inline-source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [{
          loader: "ts-loader",
          options: { configFile: path.resolve("./tsconfig.webpack.json")}
        }],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensionAlias: {
      ".js": [".ts", ".js"],
      ".mjs": [".mts", ".mjs"]
    }
  },
  output: {
    filename: "[name].js",
    path: path.resolve("./dist"),
    library: {
      type: "module"
    },
    clean: true
  },
  experiments: {
    outputModule: true
  },
  plugins: [
      new HtmlWebpackPlugin({
          title: "Canvas zoom sample",
          template: "index.html",
          //inject: "body",
          inject: false,
          scriptLoading: "module"
      }),
  ],
  devServer: {
      static: [
          { directory: path.resolve("./dist") }
      ],
      compress: false,
      port: 8080,
  },
}