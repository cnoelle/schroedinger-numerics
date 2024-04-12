import uPlot, { AlignedData, Options, Series } from "uplot";
import { JsUtils } from "./JsUtils.js";
import {  Coordinates, QmWidget, QuantumResidualSettings, QuantumSettings, QuantumSystem, QuantumSystemResidual, SimulationParameters, VisualizationSettings, WaveFunctionData } from "./types.js";


export class WaveFunctionPlot extends HTMLElement implements QmWidget {

    private static DEFAULT_TAG: string = "wavefunction-plot";
    private static _tag: string|undefined;

    static get observedAttributes() {
        return ["width", "height", "absolute-values", "show-norm", "show-real-imag", "show-potential",
                "value-range",
                "wave-function-type", "representation", "plot-title"]; 
    }

    /**
     * Call once to register the new tag type "<wavefunction-plot></wavefunction-plot>"
     * @param tag 
     */
    static register(tag?: string) {
        tag = tag || WaveFunctionPlot.DEFAULT_TAG;
        if (tag !== WaveFunctionPlot._tag) {
            customElements.define(tag, WaveFunctionPlot);
            WaveFunctionPlot._tag = tag;
        }
    }

    /**
     * Retrieve the registered tag type for this element type, or undefined if not registered yet.
     */
    static tag(): string|undefined {
        return WaveFunctionPlot._tag;
    }

    #chart: uPlot;
    #qmResultsAndFieldPresent: Array<boolean>|undefined = undefined;
    // range explicitly set
    #valueRange: [number, number]|undefined; 
    // range determined from data
    #yRange: [number, number] = [0, 1];  // TODO [number, number]
    #ERange: [number, number] = [0, 1];
    #currentSettings: Array<QuantumSettings&VisualizationSettings> = [];
    #activeIds: Array<string> = [];

    // TODO when any of the below change, we need to react
    #absoluteValues: boolean = false;
    #showNorm: boolean = true;
    #showRealImag: boolean = true;
    #showPotential: boolean = true;
    #waveFunctionType: "psi"|"phi" = "psi";
    #representation: "x"|"p" = "x";

    set width(width: number) {
        this.#chart?.setSize({width: width, height: this.#chart?.height});
    }

    get width(): number|undefined {
        return this.#chart?.width;
    }

    set height(height: number) {
        this.#chart?.setSize({width: this.#chart?.width, height: height});
    }

    get height(): number|undefined {
        return this.#chart?.height;
    }

    set absoluteValues(absolute: boolean) {
        this.#absoluteValues = absolute;
    }

    get absoluteValues(): boolean {
        return this.#absoluteValues;
    }

    set showNorm(show: boolean) {
        this.#showNorm = show;
    }

    get showNorm(): boolean {
        return this.#showNorm;
    }

    set showRealImag(show: boolean) {
        this.#showRealImag = show;
    }

    get showRealImag(): boolean {
        return this.#showRealImag;
    }

    set showPotential(show: boolean) {
        this.#showPotential = show;
    }

    get showPotential(): boolean {
        return this.#showPotential;
    }

    get valueRange(): [number, number]|undefined {
        return this.#valueRange ? [...this.#valueRange] : undefined;
    }

    set valueRange(range: [number, number]|undefined) {
        this.#valueRange = range ? [...range] : undefined;
    }

    set waveFunctionType(type: "psi"|"phi") {
        this.#waveFunctionType = type;
    }

    get waveFunctionType(): "psi"|"phi" {
        return this.#waveFunctionType;
    }

    set plotTitle(title: string|undefined) {
        this.setAttribute("plot-title", title);
    }

    get plotTitle(): string|undefined {
        return this.getAttribute("plot-title") || undefined;
    }

    set representation(representation: "x"|"p") {
        this.#representation = representation;
    }

    get representation(): "x"|"p" {
        return this.#representation
    }

    attributeChangedCallback(name: string, oldValue: string|null, newValue: string|null) {
        const attr: string = name.toLowerCase();
        switch (attr) {
        case "representation":
            if (newValue === "x" || newValue === "p")
                this.representation = newValue;
            break;
        case "width":
        case "height":
            const num = parseFloat(newValue);
            if (!Number.isFinite(num) || num < 0)
                return;
            if (attr === "width")
                this.width = num;
            else
                this.height = num;
            break;
        case "absolute-values":
        case "show-norm":
        case "show-real-imag":
        case "show-potential":
            const bool: boolean = !!newValue && newValue?.toLowerCase() !== "false";
            if (attr === "absolute-values")
                this.absoluteValues = bool;
            else if (attr === "show-norm")
                this.showNorm = bool;
            else if (attr === "show-real-imag")
                this.showRealImag = bool;
            else
                this.showPotential = bool;
            break;
        case "wave-function-type":
            newValue = newValue?.toLowerCase();
            if (newValue === "psi" || newValue === "phi")
                this.#waveFunctionType = newValue;
            break;
        case "value-range":
            if (newValue) {
                const arr: [number, number] = newValue.split(",").map(v => parseFloat(v)) as any;
                if (arr.length !== 2 || arr.findIndex(v => !Number.isFinite(v)) >= 0)
                    throw new Error("Invalid attribute value-range, need two numbers separated by a comma, got " + newValue);
                this.valueRange = arr;
            } else
                this.valueRange = undefined;
            break;
        default:
            //this.#canvas.setAttribute(name, newValue);
        }
    }

    readonly #element: HTMLElement;

    constructor() {
        super();
        this.attachShadow({mode: "open"});
        this.#element = JsUtils.createElement("div", {parent: this.shadowRoot});
        JsUtils.loadCss("./assets/css/uPlot.min.css", {parent: this.#element});
    }

    private _getRange() {
        let range = this.#valueRange || this.#yRange;
        if (this.#absoluteValues && range[0] < 0) {
            if (range[1] < 0)
                range = [-range[1], -range[0]];
            else 
                range = [0, range[1]];
        }
        return range;
    }

    private _initChart() {
        if (!this.#chart) {
            const width: number = parseInt(this.getAttribute("width")) 
                || this.getBoundingClientRect().width || 800;
            const height: number = parseInt(this.getAttribute("height")) 
                || /*this.#element.getBoundingClientRect().height ||*/ 600;
            const symb = (this.#waveFunctionType === "phi" ? "Φ" : "ψ");
            const title = this.getAttribute("plot-title") || (this.representation === "x" ? symb + "(x)"
                : "<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mover><mrow>"
                    + symb + "</mrow><mo>~</mo></mover></math>(p)");
            const options: Options = {
                width: width,
                height: height,
                title: title,
                cursor: {drag: { x: true, y: true, uni: 50  } }, // FIXME?=
                scales: {
                    x: { time: false },
                    1: { range: (self, min, max) => this._getRange() },
                },
                series: [{label: "x"}, {label: "Test"}],
                axes: [{}, {
                    scale: "1",
                    values: (self, ticks) => ticks.map(rawValue => JsUtils.formatNumber(rawValue)),
                }]
            };
            if (this.#showPotential && this.#representation !== "p") {
                options.scales["E"] = { range: (self, min, max) => this.#ERange };
                options.axes.push({
                    scale: "E",
                    values: (self, ticks) => ticks.map(rawValue => JsUtils.formatNumber(rawValue, 5)),
                    side: 1,
                    grid: {show: false},
                });
            }
            const data: AlignedData = [
                [], []
            ] as any;
            this.#chart = new uPlot(options, data, this.#element);
            if (title.startsWith("<math")) {
                const titleDiv = this.shadowRoot.querySelector(".u-title");
                if (titleDiv)
                    titleDiv.innerHTML = titleDiv.textContent;
            }
        } else {
            // TODO adapt existing
        }
    }

    /* initialize(results: Array<QuantumSimulationResult>): void {*/
    initialize(settings: Array<SimulationParameters>): void {
        this.#qmResultsAndFieldPresent = undefined;
        const qmResults: Array<SimulationParameters> = settings.filter(s => !!(s as QuantumSettings).valueRange);
        this.#currentSettings = /*qmResults as any*/ settings as any;
        const ids: Array<string> = qmResults.map(r => r.id);
        if (ids.length === 0) { 
            this.clear();
            return;
        }
        let rangeField = this.#waveFunctionType;
        if (this.#representation === "p")
            rangeField = rangeField + "P";
        const ranges0 = qmResults.map(s => (s as QuantumSettings).valueRange);
        const ranges: Array<[number, number]|undefined> = ranges0.map(wfRanges => wfRanges[rangeField]);
        if (ranges.find(r => r !== undefined) === undefined) {
            this.clear();
            return;
        }
        this.hidden = false;
        const min = ranges.reduce((a,b) => b === undefined ? a : Math.min(a, b[0]), 0);
        const max = ranges.reduce((a,b) => b === undefined ? a : Math.max(a, b[1]), 0);
        this.#yRange = [min, max];
        const isAbsolute = this.#absoluteValues;

        
    }

    private _initializeInternal(state: Array<QuantumSystem|QuantumSystemResidual>): void {
        const qmResults = this.#currentSettings;
        const ids: Array<string> = qmResults.map(r => r.id);
        this._initChart();
        const multiIds: boolean = ids.length > 1;
        // remove old series
        const s: number = this.#chart.series.length;
        for (let idx=s-1; idx > 0; idx--) {
            this.#chart.delSeries(idx);
        }
        let idx: number = -1;
        let potentialAdded: boolean = this.#representation === "p";
        const psiLabel: string = this.#waveFunctionType === "phi" ? "Φ" : "ψ";
        for (const id of ids) {
            idx++;
            const isApplicable = this.#qmResultsAndFieldPresent[idx];
            if (!isApplicable)
                continue;
            /*const colors: [string, string, string] = [ColorPalette.getColor(idx, 0), ColorPalette.getColor(idx, 1), ColorPalette.getColor(idx, 2)]*/
            const color = qmResults[idx].color.toString();
            const psiSquared: Series = {
                label: multiIds ? "|" + psiLabel +"_" + id +"|" : "|" + psiLabel +"|",
                //fill // TODO color
                show: true,
                spanGaps: false,
                //value: (self, rawValue) => "$" + rawValue.toFixed(2),
            
                // series style
                points: { show: true, size: 2, fill:/* colors[0]*/ color},
                stroke: /* colors[0] */ color,
                width: 1,
                scale: "1"
                //fill: "rgba(0, 255, 0, 0.1)", // TODO configurable
                //dash: [10, 5],
            };
            const psiReal: Series = {
                label: multiIds ? "|Re(" + psiLabel + "_" + id +")|" : "|Re(" + psiLabel + ")|",
                //fill // TODO color
                show: false,
                spanGaps: false,
                //value: (self, rawValue) => "$" + rawValue.toFixed(2),
            
                // series style
                points: { show: true, size: 2, fill: /*colors[1]*/ color},
                stroke: /* colors[1] */ color,
                width: 1,
                scale: "1",
                //fill: "rgba(0, 255, 0, 0.1)", // TODO configurable
                dash: [10, 5],
            };
            const psiImg: Series = {
                label: multiIds ? "|Im(" + psiLabel + "_" + id +")|" : "|Im(" + psiLabel + ")|",
                show: false,
                spanGaps: false,
                //value: (self, rawValue) => "$" + rawValue.toFixed(2),
            
                // series style
                points: { show: true, size: 2, fill: /*colors[2]*/color},
                stroke: /*colors[2]*/color,
                width: 1,
                scale: "1"
                //fill: "rgba(0, 255, 0, 0.1)", // TODO configurable
                //dash: [10, 5],
            };
            this.#chart.addSeries(psiSquared);
            this.#chart.addSeries(psiReal);
            this.#chart.addSeries(psiImg);
            if (!potentialAdded && (this.#waveFunctionType === "psi" || qmResults[idx].V || qmResults[idx].V_coefficients)) {
                // TODO remember which potential is shown!
                potentialAdded = true;
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
        const potentialValues: Array<[number, number]> = this.#waveFunctionType === "psi" ? qmResults.map(s => s.potentialValueRange) :
            qmResults.filter(s => (s as QuantumResidualSettings).phiPotentialValueRange).map(s => (s as QuantumResidualSettings).phiPotentialValueRange);
        const VMin = potentialValues.length === 0 ? 0 : Math.min(...potentialValues.map(V => V[0]));
        const VMax = potentialValues.length === 0 ? 1 : Math.max(...potentialValues.map(V => V[1]));
        this.#ERange = [VMin, VMax];
        this.#chart.setData(this.#chart.series.map(() => []) as any);
    }

    set(state: Array<QuantumSystem|QuantumSystemResidual>): void {
        if (!this.#qmResultsAndFieldPresent) {
            if (this.#representation === "p") {
                // @ts-ignore
                this.#qmResultsAndFieldPresent = state.map(s => this.#waveFunctionType === "phi" ? !!s.phiP : !!s.psiP);    
            } else {
                // @ts-ignore
                this.#qmResultsAndFieldPresent = state.map(s => this.#waveFunctionType === "phi" ? !!s.phi : !!s.psi);    
            }
            this._initializeInternal(state);
        }
        /**
         * Filter out classical results and results with missing fields for the present config
         */
        state = state.filter((_, idx) => this.#qmResultsAndFieldPresent[idx]);
        if (!(state.length > 0) || !this.#chart)
            return;
        const coords: Array<Array<number>> = this.#representation === "p" ?
            // @ts-ignore
            state.map(s => this.#waveFunctionType === "phi" ? s.phiP?.basePoints : s.psiP?.basePoints) :
            // @ts-ignore
            state.map(s => this.#waveFunctionType === "phi" ? s.phi?.basePoints : s.psi?.basePoints);
        if (!coords)
            return;
        // @ts-ignore
        //const coordinates: Array<Coordinates> = state.map(s => this.#waveFunctionType === "phi" ? s.phiCoordinates : s.psiCoordinates);
        //const coords: Array<Array<number>> = coordinates.map(c => this.#representation === "p" ? c.p : c.x);
        const domain: [Array<number>, boolean] = JsUtils.mergeArrays(coords);
        const allDomainsEqual: boolean = domain[1];
        const data: AlignedData = [domain[0]]; //[slices[0].x];
        let idx: number = -1;
        let wf: string = this.#waveFunctionType;  // psi or phi
        if (this.#representation === "p")
            wf += "P";
        let potentialAdded: boolean = this.#representation === "p"; 
        const realMapper = this.#absoluteValues ? (xy: [number, number]) => Math.abs(xy[0])
            : (xy: [number, number]) => xy[0];
        const imagMapper = this.#absoluteValues ? (xy: [number, number]) => Math.abs(xy[1])
            : (xy: [number, number]) => xy[1];

        for (const result of state) {
            idx++;
            // @ts-ignore
            const waveFunction: WaveFunctionData = result[wf];
            if (allDomainsEqual) {
                const abs: Array<number> = waveFunction.values.map(xy => Math.sqrt(xy[0]*xy[0] + xy[1]*xy[1]));
                const real: Array<number> = waveFunction.values.map(realMapper);
                const img: Array<number> = waveFunction.values.map(imagMapper);
                //const data: AlignedData = [x, abs, real, img, slice.settings.V];
                data.push(...[abs, real, img]);
                if (!potentialAdded && (this.#waveFunctionType === "psi" && this.#currentSettings[idx].V || 
                        this.#waveFunctionType === "phi" && (result as QuantumSystemResidual).phiPotential)) {
                    const V: Array<number> = this.#waveFunctionType === "phi" ? (result as QuantumSystemResidual).phiPotential : 
                        this.#currentSettings[idx].V;
                    data.push(V);
                    potentialAdded = true;
                }
            } else {
                const points: Array<number> =
                    // @ts-ignore
                    (result[this.#waveFunctionType + "Coordinates"] as Coordinates)[this.#representation]
                const ev = (f: ((xy: [number, number]) => number)): Array<number> => {
                    return domain[0].map(x => {
                        const idx: number = points.indexOf(x);
                        if (idx < 0)
                            return NaN;
                        const xy: [number, number] = waveFunction.values[idx];
                        return f(xy);
                    });
                };
                const abs: Array<number> = ev(xy => Math.sqrt(xy[0]*xy[0] + xy[1]*xy[1]));
                const real: Array<number> = ev(realMapper);
                const img: Array<number> = ev(imagMapper);
                data.push(...[abs, real, img]);
                // @ts-ignore
                if (!potentialAdded && (this.#waveFunctionType === "psi" && result.psiPotential || 
                        // @ts-ignore
                        this.#waveFunctionType === "phi" && result.phiPotential)) {
                    // @ts-ignore
                    const V: Array<number> = this.#waveFunctionType === "phi" ? result.phiPotential : result.psiPotential;
                    const V2 = domain[0].map(x => {
                        const idxX: number = points.indexOf(x);
                        if (idxX < 0)
                            return NaN;
                        return V[idxX];
                    })
                    data.push(V2);
                    potentialAdded = true;
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

    clear(): void {
        this.hidden = true;
        this.#qmResultsAndFieldPresent = undefined;
        this.#currentSettings = [];
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