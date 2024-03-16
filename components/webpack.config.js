import path from "path";
import HtmlWebpackPlugin from "html-webpack-plugin";

export default {
  entry: {
    WaveFunctionPlot: "./src/WaveFunctionPlot.ts",
    PhaseSpaceDensityWidget: "./src/PhaseSpaceDensityWidget.ts",
    FileUpload: "./src/FileUpload.ts",
    SimulationControls: "./src/SimulationControls.ts",
    SimulationController: "./src/SimulationController.ts"
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
    /*
      new CopyPlugin({
        patterns: [
            { from: "./assets", to: "./assets" }
        ]
      }),*/
      new HtmlWebpackPlugin({
          title: "Schrödinger numerics demo",
          template: "index.html",
          //inject: "body",
          inject: false,
          scriptLoading: "module"
      }),
  ],
  devServer: {
      static: [
          { directory: path.resolve("./dist") },
          { directory: path.resolve("./assets"), publicPath: "/assets" }
      ],
      compress: false,
      port: 8080,
  },
}