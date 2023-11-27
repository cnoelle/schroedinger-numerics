import uPlot, { AlignedData, Options, Series } from "uplot";
import "../node_modules/uplot/dist/uPlot.min.css";
import { ColorPalette } from "./colorPalette.js";
import { JsUtils } from "./JsUtils.js";
import { SimulationListener, QuantumSimulationResult, Timeslice } from "./types.js";

export class PsiPlot implements SimulationListener {

    #element: HTMLElement;
    #chart: uPlot;
    #yRange: number = 1;
    #ERange: number = 1;
    #activeIds: Array<string> = [];

    constructor(private readonly secondary?: boolean) {
        this.#element = document.querySelector(secondary ? "#waveFunctionTilde" : "#waveFunction");
    }

    build() {
        if (this.#chart)
            return;
        const width: number = this.#element.getBoundingClientRect().width || 800; // FIXME?
        const height: number = /*this.#element.getBoundingClientRect().height ||*/ 600;
        const options: Options = {
            width: width,
            height: height,
            title: this.secondary ? /*"ψ̃ "*/ "Φ" : "ψ",
            cursor: {drag: { x: true, y: true, uni: 50  } }, // FIXME?=
            scales: {
                x: { time: false },
                1: { range: (self, min, max) => [0, this.#yRange] },
                E: { range: (self, min, max) => [0, this.#ERange] }
            },
            series: [{label: "x"}, {label: "Test"}],
            axes: [{}, {
                scale: "1",
                values: (self, ticks) => ticks.map(rawValue => JsUtils.formatNumber(rawValue)),
              },
              {
                scale: "E",
                values: (self, ticks) => ticks.map(rawValue => JsUtils.formatNumber(rawValue, 5)),
                side: 1,
                grid: {show: false},
              },]
        };
        const data: AlignedData = [
            [], []
        ] as any;
        this.#chart = new uPlot(options, data, this.#element);
        // for debugging
        (window as any).sch = (window as any).sch || {};
        const debugId: string = this.secondary ? "Phi" : "psi";
        (window as any).sch[debugId] = this.#chart; 
        // on this object we can use the uPlot API, see https://github.com/leeoniya/uPlot/blob/master/dist/uPlot.d.ts
        // e.g. window.sch.psi.setSize({width: 640, height: 480})
    }

    initialize(results: Array<QuantumSimulationResult>): void {
        if (this.secondary)
            results = results.filter(r => r.waveFunctionTilde);
        const ids: Array<string> = results.map(r => r.id);
        if (ids.length === 0) { 
            this.clear();
            return;
        }
        this.build();
        const multiIds: boolean = ids.length > 1;
        if (this.#activeIds.length === 1 && !multiIds)
            return;
        if (this.#activeIds.length === ids.length && !ids.find(id => this.#activeIds.indexOf(id) < 0))
            return;
        // remove old series
        const s: number = this.#chart.series.length;
        for (let idx=s-1; idx > 0; idx--) {
            this.#chart.delSeries(idx);
        }
        // TODO the coloring should be aligned between primary (psi) and secondary (Phi) results
        let idx: number = -1;
        // psi tilde => in Libre Office, copy the psi (from somewhere), then enter "0303" followed by Alt+C.
        const psi: string = this.secondary ? /*"ψ̃"*/ "Φ" : "ψ";
        for (const id of ids) {
            idx++;
            const colors: [string, string, string] = [ColorPalette.getColor(idx, 0), ColorPalette.getColor(idx, 1), ColorPalette.getColor(idx, 2)]
            const psiSquared: Series = {
                label: multiIds ? "|" + psi +"_" + id +"|" : "|" + psi +"|",
                //fill // TODO color
                show: true,
                spanGaps: false,
                //value: (self, rawValue) => "$" + rawValue.toFixed(2),
            
                // series style
                points: { show: true, size: 2, fill: colors[0]},
                stroke: /*"blue"*/ colors[0],
                width: 1,
                scale: "1"
                //fill: "rgba(0, 255, 0, 0.1)", // TODO configurable
                //dash: [10, 5],
            };
            const psiReal: Series = {
                label: multiIds ? "|Re(" + psi + "_" + id +")|" : "|Re(" + psi + ")|",
                //fill // TODO color
                show: false,
                spanGaps: false,
                //value: (self, rawValue) => "$" + rawValue.toFixed(2),
            
                // series style
                points: { show: true, size: 2, fill: colors[1]},
                stroke: /*"red"*/ colors[1],
                width: 1,
                scale: "1",
                //fill: "rgba(0, 255, 0, 0.1)", // TODO configurable
                dash: [10, 5],
            };
            const psiImg: Series = {
                label: multiIds ? "|Im(" + psi + "_" + id +")|" : "|Im(" + psi + ")|",
                //fill // TODO color
                show: false,
                spanGaps: false,
                //value: (self, rawValue) => "$" + rawValue.toFixed(2),
            
                // series style
                points: { show: true, size: 2, fill: colors[2]},
                stroke: colors[2],
                width: 1,
                scale: "1"
                //fill: "rgba(0, 255, 0, 0.1)", // TODO configurable
                //dash: [10, 5],
            };
            this.#chart.addSeries(psiSquared);
            this.#chart.addSeries(psiReal);
            this.#chart.addSeries(psiImg);
             // FIXME single V only?
             if (!this.secondary || results[idx].potential) {
                const V: Series = {
                    label: multiIds ? "|V_" + id +"|" : "V",
                    //fill // TODO color
                    show: true,
                    spanGaps: false,
                    //value: (self, rawValue) => "$" + rawValue.toFixed(2),
                
                    // series style
                    points: { show: true, size: 2, fill: "black"},
                    stroke: "black",
                    width: 1,
                    scale: "E"
                    //fill: "rgba(0, 255, 0, 0.1)", // TODO configurable
                    //dash: [10, 5],
                };
                this.#chart.addSeries(V); // ? 
            }
            
        }
        this.#activeIds = ids;
        let maxPotential: number;
        if (this.secondary)
            maxPotential =results.map(r => r.potential).find(V => V)?.flatMap(v => v)?.reduce((max, val) => val > max ? val : max, 0) || 0;
        else
            maxPotential =results.map(r => r.settings).find(s => s)?.V?.reduce((max, val) => val > max ? val : max, 0) || 0;
        this.#ERange = maxPotential;
        this.#chart.setData(this.#chart.series.map(() => []) as any);
    }

    scale(scale: number): void {
        this.#yRange = scale;
    }

    // ||psi||, psi_R, psi_I
    // potential: outer index: dataset idx, inner index: spatial
    next(slices: Array<[Timeslice, Timeslice|undefined]>, _: any, potential?: Array<Array<number>|undefined>): void {
        if (!(slices?.length > 0) || !this.#chart)
            return;
        const domain: [Array<number>, boolean] = JsUtils.mergeArrays(slices.map(slice => slice[this.secondary ? 1:  0]?.x));
        const allDomainsEqual: boolean = domain[1];
        const data: AlignedData = [domain[0]]; //[slices[0].x];
        let idx: number = -1;
        for (const sliceArr of slices) {
            idx++;
            const slice: Timeslice|undefined = sliceArr[this.secondary ? 1 : 0];
            if (!slice) // TODO ok?
                continue;
            const psi: Array<[number, number]> = slice.waveFunction;
            //const x: Array<number> = slice.x;
            if (allDomainsEqual) {
                const abs: Array<number> = psi.map(xy => Math.sqrt(xy[0]*xy[0] + xy[1]*xy[1]));
                const real: Array<number> = psi.map(xy => Math.abs(xy[0]));
                const img: Array<number> = psi.map(xy => Math.abs(xy[1]));
                //const data: AlignedData = [x, abs, real, img, slice.settings.V];
                data.push(...[abs, real, img]);
                if (!this.secondary || potential) {
                    const V = this.secondary ? potential[idx] : slice.settings.V;
                    if (V)
                        data.push(V);
                }
            } else {
                const localX: Array<number> = slice.x;
                const ev = (f: ((xy: [number, number]) => number)): Array<number> => {
                    return domain[0].map(x => {
                        const idx: number = localX.indexOf(x);
                        if (idx < 0)
                            return NaN;
                        const xy: [number, number] = psi[idx];
                        return f(xy);
                    });
                };
                const abs: Array<number> = ev(xy => Math.sqrt(xy[0]*xy[0] + xy[1]*xy[1]));
                const real: Array<number> = ev(xy => Math.abs(xy[0]));
                const img: Array<number> = ev(xy => Math.abs(xy[1]));
                data.push(...[abs, real, img]);
                if (!this.secondary || (potential && potential[idx])) {
                    const V: Array<number> = domain[0].map(x => {
                        const idxX: number = localX.indexOf(x);
                        if (idxX < 0)
                            return NaN;
                        return this.secondary ? potential[idx][idxX] : slice.settings.V[idxX];
                    });
                    if (V)
                        data.push(V);
                }
            }
        }
        // allow the potential to be specified for a single timestep only (for relax representation)
        const dataLength: number = data.length;
        const seriesLength: number = this.#chart.series.length;
        if (dataLength < seriesLength) {
            const oldDataLength: number = this.#chart.data.length;
            if (oldDataLength > dataLength) {
                for (let idx=dataLength; idx<Math.min(oldDataLength, seriesLength); idx++) {
                    data.push(this.#chart.data[idx]);
                }
            }
        }

        this.#chart.setData(data);
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

}