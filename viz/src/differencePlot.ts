import uPlot, { AlignedData, Options, Series } from "uplot";
import "../node_modules/uplot/dist/uPlot.min.css";
import { ColorPalette } from "./colorPalette";
import { JsUtils } from "./JsUtils.js";
import { SimulationListener, QuantumSimulationResult, Timeslice } from "./types.js";

export class DifferencePlot implements SimulationListener {


    #element: HTMLElement;
    #chart: uPlot;
    #activeIds: Array<string> = [];
    #yRange: number = 2;

    constructor() {
        this.#element = document.querySelector("#waveFunctionDifferences");
    }

    build() {
        if (this.#chart)
            return;
        const width: number = this.#element.getBoundingClientRect().width || 800; // FIXME?
        const height: number = /*this.#element.getBoundingClientRect().height ||*/ 600;
        const options: Options = {
            width: width,
            height: height,
            title: "Difference",
            cursor: {drag: { x: true, y: true, uni: 50  } }, // FIXME?=
            scales: {
                x: { time: false },
                1: { range: (self, min, max) => [0, this.#yRange]}
            },
            series: [{label: "t"}, {label: "Test"}],
            axes: [{}, {
                scale: "1",
                //values: (self, ticks) => ticks.map(rawValue => rawValue.toFixed(1) + "%"),
              },
              /*
              {
                scale: "E",
                //values: (self, ticks) => ticks.map(rawValue => rawValue.toFixed(2) + "MB"),
                side: 1,
                grid: {show: false},
              }*/]
        };
        const data: AlignedData = [
            [], []
        ] as any;
        this.#chart = new uPlot(options, data, this.#element);
        // for debugging
        (window as any).sch = (window as any).sch || {};
        (window as any).sch.diffChart = this.#chart;
    }

    initialize(results: Array<QuantumSimulationResult>): void {
        const ids: Array<string> = results.map(r => r.id);
        if (ids.length === 0) { 
            this.clear();
            return;
        }
        if (ids.length <= 1) {
            this.clear();
            return;
        }
        this.build(); // TODO
        if (this.#activeIds.length === ids.length && !ids.find(id => this.#activeIds.indexOf(id) < 0))
            return;
        // remove old series
        const s: number = this.#chart.series.length;
        for (let idx=s-1; idx > 0; idx--) {
            this.#chart.delSeries(idx);
        }
        const l: number = ids.length;
        // TODO timestamps
        const timestampsMerged: [Array<number>, boolean] = JsUtils.mergeArrays(results.map(r => r.timesteps));
        const timestamps: Array<number> = timestampsMerged[0];
        const timestampsEqual: boolean = timestampsMerged[1];
        const data: AlignedData = [timestamps];
        for (let idx=0; idx < l/2 + 1; idx++) {
            const id: string = ids[idx];
            for (let idx2=idx+1; idx2 < l; idx2++) {
                const id2: string = ids[idx2];
                const series: Series = {
                    label: "||Psi_" + id + " - Psi_" + id2 + "||_2",
                    //fill // TODO color
                    show: true,
                    spanGaps: false,
                    //value: (self, rawValue) => "$" + rawValue.toFixed(2),
                
                    // series style
                    points: { show: true, size: 2, fill: "blue"},
                    stroke: ColorPalette.getColor(idx + idx2 - 1, 0),
                    width: 1,
                    scale: "1"
                    //fill: "rgba(0, 255, 0, 0.1)", // TODO configurable
                    //dash: [10, 5],
                };
                this.#chart.addSeries(series);
                data.push(DifferencePlot.getDifference(results[idx], results[idx2], timestamps, timestampsEqual));
            }
        }
        this.#activeIds = ids;
        this.#yRange = Math.max(1, ...data.filter((_, idx) => idx > 0).map(arr => Math.max(0, ...arr.filter(v => v))));
        this.#chart.setData(data);
    }

    scale(scale: number): void {
        // void 
    }

    // TODO
    next(slices: Array<[Timeslice, Timeslice|undefined]>): void {
        if (!(slices?.length > 0))
            return;
    }

    setWidth(width: number): void {
        this.#chart?.setSize({width: width, height: this.#chart?.height});
    }

    clear(): void {
        if (!this.#chart)
            return;
        // remove old series
        const s: number = this.#chart.series.length;
        for (let idx=s-1; idx > 0; idx--) {
            this.#chart.delSeries(idx);
        }
        this.#chart.addSeries({label: "Test"});
        this.#chart?.setData([[], []]);
        this.#activeIds = [];
    }

    /**
     * Get the norm difference between two wave functions for all common timestamps
     * @param r1 
     * @param r2 
     * @param timestamps 
     * @param timestampsEqual 
     */
    private static getDifference(r1: QuantumSimulationResult, r2: QuantumSimulationResult, timestamps: Array<number>, timestampsEqual: boolean): Array<number> {
        return timestamps.map((t, idx) => {
            const idx1: number = timestampsEqual ? idx : r1.timesteps.indexOf(t);
            const idx2: number = timestampsEqual ? idx : r2.timesteps.indexOf(t);
            if (idx1 < 0 || idx2 < 0)
                return NaN;
            const psi1: Timeslice = r1.waveFunction[idx1];
            const psi2: Timeslice = r2.waveFunction[idx2];
            return DifferencePlot.normDiff(psi1, psi2);            
        });
    }

    private static normDiff(psi1: Timeslice, psi2: Timeslice): number {
        const l1: number = psi1.x.length;
        const l2: number = psi2.x.length;
        const xsEqual: boolean = l1 === l2 && psi1.x[0] === psi2.x[0] && 
            psi1.x[l1-1] === psi2.x[l2-1];
        const square = (v1: [number, number], v2: [number, number]): number => (v1[0] - v2[0]) * (v1[0] - v2[0]) + (v1[1] - v2[1]) * (v1[1] - v2[1]);
        if (xsEqual) {
            let diff: number = 0;
            for (let idx=0; idx<psi1.x.length; idx++) {
                const v1: [number, number] = psi1.waveFunction[idx];
                const v2: [number, number] = psi2.waveFunction[idx];
                diff += square(v1, v2);
            }
            return Math.sqrt(diff);
        }
        // TODO we need to take into account different delta xs as well!
        let idx1: number = 0;
        let idx2: number = 0;
        let diff: number = 0;
        while (idx1 < l1 || idx2 < l2) {
            if (idx1 >= l1) {
                diff += square([0, 0], psi2.waveFunction[idx2]);
                idx2++;
                continue;
            } else if (idx2 >= l2) {
                diff += square([0, 0], psi1.waveFunction[idx1]);
                idx1++;
                continue;
            }
            const nextX1: number = psi1.x[idx1];
            const nextX2: number = psi2.x[idx2];
            if (nextX1 === nextX2) {
                diff += square(psi1.waveFunction[idx1], psi2.waveFunction[idx2]);
                idx1++;
                idx2++;
            } else if (nextX1 < nextX2) {
                const v2: [number, number] = idx2 === 0 ? [0, 0] : psi2.waveFunction[idx2];
                diff += square(psi1.waveFunction[idx1], v2);
                idx1++;
            } else {
                const v1: [number, number] = idx1 === 0 ? [0, 0] : psi1.waveFunction[idx1];
                diff += square(v1, psi2.waveFunction[idx2]);
                idx2++;
            }
        }
        return Math.sqrt(diff);
    }


}