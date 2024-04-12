import path from "path";
import HtmlWebpackPlugin from "html-webpack-plugin";

export default {
  entry: {
    WaveFunctionPlot: "./src/WaveFunctionPlot.ts",
    PhaseSpaceDensityWidget: "./src/PhaseSpaceDensityWidget.ts",
    ObservablesWidget: "./src/ObservablesWidget.ts",
    FileUpload: "./src/FileUpload.ts",
    DatasetsGrid: "./src/DatasetsGrid.ts",
    SimulationControls: "./src/SimulationControls.ts",
    SimulationController: "./src/SimulationController.ts",
    DemoMenu: "./src/DemoMenu.ts"
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
    path: path.resolve("./bundle"),
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
          { directory: path.resolve("./bundle") },
          { directory: path.resolve("./assets"), publicPath: "/assets" }
      ],
      compress: false,
      port: 8080,
  },
}