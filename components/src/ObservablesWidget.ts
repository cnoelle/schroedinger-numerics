import { JsUtils } from "./JsUtils.js";
import { ClassicalSystem, ExpectationValues, QmWidget, QuantumSettings, QuantumSystem, SimulationParameters, SimulationResult, SimulationResultClassical, SimulationResultQm, SimulationSystem } from "./types.js";

type MutableExpectationValues = {
    -readonly [K in keyof ExpectationValues]: ExpectationValues[K] 
}

/**
 * Plots p over x, or E over x.
 * "p over x" can represent either a classical trajectory, or the expectation values of a quantum system.
 * Likewise, "E over x" can represent the energy of a classical trajectory, or the respective quantum 
 * expectation values
 */
// TODO reuse those dataset labels for the PhaseSpaceDensityWidget?
export class ObservablesWidget extends HTMLElement implements QmWidget {

    private static DEFAULT_TAG: string = "observables-widget";
    private static _tag: string|undefined;
    private static readonly _EXP_KEYS: Array<keyof ExpectationValues> = ["x", "p", "E", "x2", "p2"];

    static get observedAttributes() {
        return ["width", "height", /* "wave-function-type", "representation", */
            "observable-type", "plot-title", "show-legend"]; 
    }

    /**
     * Call once to register the new tag type "<observables-widget></observables-widget>"
     * @param tag 
     */
    static register(tag?: string) {
        tag = tag || ObservablesWidget.DEFAULT_TAG;
        if (tag !== ObservablesWidget._tag) {
            customElements.define(tag, ObservablesWidget);
            ObservablesWidget._tag = tag;
        }
    }

    /**
     * Retrieve the registered tag type for this element type, or undefined if not registered yet.
     */
    static tag(): string|undefined {
        return ObservablesWidget._tag;
    }

    /*
    #waveFunctionType: "psi"|"phi" = "psi";
    #representation: "x"|"p" = "x";
    */
    // TODO currently the x-axis always shows x, but we could also support other combinations
    #observableType: "p"|"E" = "E";
    /**
     * undefined (the default) means true for multiple simulation results and 
     * false for a single result
     */
    #showLegend: boolean|undefined = undefined;
    #adaptedERange: {xRange: [number, number], eRange: [number, number]}|undefined = undefined;

    set width(width: number) {
        this.#canvas.width = width;
    }

    get width(): number|undefined {
        return this.#canvas.width;
    }

    set height(height: number) {
        this.#canvas.height = height;
    }

    get height(): number|undefined {
        return this.#canvas.height;
    }

    set plotTitle(title: string|undefined) {
        this.setAttribute("plot-title", title);
    }

    get plotTitle(): string|undefined {
        return this.getAttribute("plot-title") || undefined;
    }

    set showLegend(show: boolean|undefined) {
        this.#showLegend = show;
    }

    get showLegend(): boolean|undefined {
        return this.#showLegend;
    }

    get observableType(): "p"|"E" {
        return this.#observableType;
    }

    set observableType(type: "p"|"E") {
        this.#observableType = type;
        this._setTitle();
    }

    attributeChangedCallback(name: string, oldValue: string|null, newValue: string|null) {
        const attr: string = name.toLowerCase();
        switch (attr) {
        case "observable-type":
            if (newValue === "p" || newValue === "E")
                this.observableType = newValue;
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
        case "plot-title":
            this._setTitle();
            break;
        case "show-legend":
            let value: boolean|undefined;
            if (newValue === undefined || newValue === null || newValue === "" || newValue === "auto")
                value = undefined;
            else if (newValue.toLowerCase() === "true" || newValue.toLowerCase().startsWith("show"))
                value = true;
            else
                value = false;
            this.showLegend = value;
            break;
        default:
        }
    }

    readonly #titleEl: HTMLDivElement;

    private _setTitle() {
        const title = this.getAttribute("plot-title") || (this.#observableType === "p" ? "Phase Space" : "Energy");
        this.#titleEl.innerText = title;
    }


    private static readonly WIDTH: number = 500;
    private static readonly HEIGHT: number = 500;
    private static readonly WIDTH_OFFSET: number = 50;
    private static readonly HEIGHT_OFFSET: number = 50;
    private static readonly TICKS: number = 5;

    readonly #element: HTMLElement;
    readonly #canvas: HTMLCanvasElement;
    readonly #container: HTMLElement;
    readonly #legendGrid: HTMLElement;
    readonly #legendContainer: HTMLElement;
    #currentPoints: Array<HTMLElement>|undefined; // one point per dataset
    #currentParameters: Array<SimulationParameters>|undefined;
    #currentMinMax: {min: ExpectationValues, max: ExpectationValues}|undefined;
    //#currentData: 

    #ticks: number = ObservablesWidget.TICKS;
    #numDigitsX: number = 2;
    #numDigitsY: number = 2;

    #activeIds: Array<string> = [];

    constructor() {
        super();
        const shadow0: ShadowRoot = this.attachShadow({mode: "open"});
        const element = JsUtils.createElement("div", {parent: shadow0, classes: ["hidden"]});

        const style: HTMLStyleElement = document.createElement("style");
        style.textContent = ":host { position: relative; margin-left: 2em; display: flex; /* min-width: 600px; */ ;} "
            + ".position-relative { position: relative; } .position-absolute { position: absolute; } "
            + ".title-container {display: flex; flex-direction: column; align-items: center;} "
            + ".legend-grid { display: grid; grid-template-columns: auto auto 1fr; align-items: center; column-gap: 1em; } "
            + ".current-point { width: 0px; height: 0px; border: solid 5px red; border-radius: 5px; } "
            + ".phase-space-legend { margin-bottom: 6em; align-self: end; }"
            + ".hidden { display: none; }";;
        shadow0.append(style);
        const titleContainer = JsUtils.createElement("div", {parent: element, classes: ["title-container"]});
        this.#titleEl = JsUtils.createElement("h3", {text: "Energy", parent: titleContainer});
        const container: HTMLElement = JsUtils.createElement("div", {parent: titleContainer, classes: ["position-relative"]});

        const canvas = JsUtils.createElement("canvas", {parent: container });
        canvas.width = ObservablesWidget.WIDTH + 2 * ObservablesWidget.WIDTH_OFFSET;
        canvas.height = ObservablesWidget.HEIGHT + 2 * ObservablesWidget.HEIGHT_OFFSET;


        const legend: HTMLElement = JsUtils.createElement("fieldset", { classes: ["phase-space-legend"], parent: element});
        const legendTitle: HTMLElement = JsUtils.createElement("legend", {parent: legend, text: "Datasets"});
        const legendGrid: HTMLElement = JsUtils.createElement("div", {parent: legend, classes: ["legend-grid"]});
        this.#legendGrid = legendGrid;
        this.#legendContainer = legend;
        legend.hidden = true;

        this.#canvas = canvas;
        this.#container = container;
        this.#element = element;
    }

    private _setLegendVisibility() {
        if (this.#showLegend === false)
            this.#legendContainer.hidden = true;
        else {
            const l: number = this.#currentParameters?.length || 0;
            const show: boolean = l > 1 || (l === 1 && this.#showLegend);
            this.#legendContainer.hidden = !show;
        }
    }

    private _drawAxes(ctx: CanvasRenderingContext2D) {
        const minMax: {min: ExpectationValues; max: ExpectationValues;} = this.#currentMinMax;
        if (!minMax)
            return;
        const width = this.width;  // FIXME need to 
        const height = this.height;
        const xRange = this.#adaptedERange?.xRange || [minMax.min.x, minMax.max.x];
        const pRange = this.#observableType === "p" ? [minMax.min.p, minMax.max.p] : 
            (this.#adaptedERange?.eRange || [minMax.min.E, minMax.max.E])
        const startX: number = 0;
        const endX: number = /*this.#width + 2 * ObservablesWidget.WIDTH_OFFSET*/ width;
        const usedStartX: number = ObservablesWidget.WIDTH_OFFSET;
        const usedEndX: number = /*this.#width + ObservablesWidget.WIDTH_OFFSET*/ width - ObservablesWidget.WIDTH_OFFSET;
        const startY: number = /*this.#height + 2 * ObservablesWidget.HEIGHT_OFFSET*/ height;
        const endY: number = 0;
        const usedStartY: number = /*this.#height + ObservablesWidget.HEIGHT_OFFSET*/ height - ObservablesWidget.HEIGHT_OFFSET;
        const usedEndY: number = ObservablesWidget.HEIGHT_OFFSET;
        ctx.strokeStyle = "black";
        // x axis
        ctx.beginPath();
        ctx.moveTo(startX, usedStartY);
        ctx.lineTo(endX, usedStartY);
           // arrow
        ctx.moveTo(endX, usedStartY);
        ctx.lineTo(endX - ObservablesWidget.WIDTH_OFFSET/4, usedStartY + ObservablesWidget.HEIGHT_OFFSET / 8);
        ctx.moveTo(endX, usedStartY);
        ctx.lineTo(endX - ObservablesWidget.WIDTH_OFFSET/4, usedStartY - ObservablesWidget.HEIGHT_OFFSET / 8);
        ctx.stroke();
        // y axis
        ctx.beginPath();
        ctx.moveTo(ObservablesWidget.WIDTH_OFFSET, startY);
        ctx.lineTo(ObservablesWidget.WIDTH_OFFSET, endY);
        // arrow
        ctx.moveTo(ObservablesWidget.WIDTH_OFFSET, endY);
        ctx.lineTo(ObservablesWidget.WIDTH_OFFSET - ObservablesWidget.WIDTH_OFFSET/8, endY + ObservablesWidget.HEIGHT_OFFSET / 4);
        ctx.moveTo(ObservablesWidget.WIDTH_OFFSET, endY);
        ctx.lineTo(ObservablesWidget.WIDTH_OFFSET + ObservablesWidget.WIDTH_OFFSET/8, endY + ObservablesWidget.HEIGHT_OFFSET / 4);

        ctx.stroke();
        // x, p ticks
        ctx.beginPath();
        const ticks: number = this.#ticks;
        const tickSpacingX: number = (usedEndX - usedStartX)/ticks;
        const tickLengthX: number = ObservablesWidget.HEIGHT_OFFSET/5;
        const tickSpacingY: number = (usedEndY - usedStartY)/ticks;
        const tickLengthY: number = ObservablesWidget.WIDTH_OFFSET/5;
        for (let idx=1; idx<=ticks; idx++) {
            const x: number = usedStartX + idx * tickSpacingX;
            ctx.moveTo(x, usedStartY);
            ctx.lineTo(x, usedStartY + tickLengthX);
            const y: number = usedStartY + idx * tickSpacingY;
            ctx.moveTo(ObservablesWidget.WIDTH_OFFSET, y);
            ctx.lineTo(ObservablesWidget.WIDTH_OFFSET-tickLengthY, y);
        }
        ctx.stroke();
        ctx.font = "16px serif";
        for (let idx=0; idx<=ticks; idx++) {
            const x: number = usedStartX + idx * tickSpacingX;
            const value: number = xRange[0] + idx / ticks * (xRange[1] - xRange[0]);
            ctx.fillText(JsUtils.formatNumber(value, this.#numDigitsX), x - tickLengthY, usedStartY + 2.5 * tickLengthX);
            const y: number = usedStartY + idx * tickSpacingY;
            const valueY: number = pRange[0] + idx/ticks * (pRange[1] - pRange[0]);
            const yPositionOffset: number = idx === 0 ? -tickLengthY/2 : tickLengthY/2; // avoid overlap with x-axis
            ctx.fillText(JsUtils.formatNumber(valueY, this.#numDigitsY), ObservablesWidget.WIDTH_OFFSET - 4.5 * tickLengthY, y + yPositionOffset);
        }
        // axis labels
        ctx.font = "bold 20px serif";
        ctx.fillText("x", width - 1.2 * tickLengthY, usedStartY + 2 * tickLengthX);
        ctx.fillText(this.#observableType === "p" ? "p" : "E", ObservablesWidget.WIDTH_OFFSET - 2.2 * tickLengthY, 1.4 * tickLengthX);
    }

    initialize(settings: Array<SimulationParameters>): void {
        this.clear();  // keep slices?
        this.#currentParameters = [...settings];
        this.#currentMinMax = undefined;
        this._setLegendVisibility();
        if (this.#currentParameters.length === 0)
            this.#element.classList.add("hidden");
        else
            this.#element.classList.remove("hidden");
    }

    private _minMax(values: Array<Partial<ExpectationValues>>): {min: ExpectationValues, max: ExpectationValues} {
        const result: {min: MutableExpectationValues, max: MutableExpectationValues} 
            = values.reduce((prev: {min: MutableExpectationValues, max: MutableExpectationValues}, 
                                curr: Partial<ExpectationValues>) => {
            ObservablesWidget._EXP_KEYS.forEach(key => {
                const val = curr[key];
                if (val === undefined)
                    return;
                if (val < prev.min[key])
                    prev.min[key] = val;
                else if (val > prev.max[key])
                    prev.max[key] = val;
            });
            return prev;
        }, {min: Object.fromEntries(ObservablesWidget._EXP_KEYS.map(key => [key, 0])) as MutableExpectationValues, 
                max: Object.fromEntries(ObservablesWidget._EXP_KEYS.map(key => [key, 0])) as MutableExpectationValues});
        return result;
    }

    initializeValues(results: SimulationResult[]): void {
        // outer array: results set, inner array: timesteps
        const values: Array<Array<Partial<ExpectationValues>>> = results.map(r => {
            const isQm: boolean = !!(r as SimulationResultQm).settingsQm;
            if (!isQm) {
                const classicalResult: SimulationResultClassical = r as SimulationResultClassical;
                return classicalResult.timesteps.map(t => t.point);
            }
            const qmResult: SimulationResultQm = r as SimulationResultQm;
            return qmResult.timesteps.map(t => t.psi); // TODO phi results?
        });
        const minMaxArr: Array<{min: ExpectationValues, max: ExpectationValues}> = values.map(v => this._minMax(v));
        const minMax: {min: ExpectationValues, max: ExpectationValues} = minMaxArr.reduce(
                    (prev: {min: MutableExpectationValues, max: MutableExpectationValues}, curr) => {
            ObservablesWidget._EXP_KEYS.forEach(key => {
                const vMin = curr.min[key];
                if (vMin < prev.min[key])
                    prev.min[key] = vMin;
                const vMax = curr.max[key];
                if (vMax > prev.max[key])
                    prev.max[key] = vMax;
            });
            return prev;
        }, {min: Object.fromEntries(ObservablesWidget._EXP_KEYS.map(key => [key, 0])) as MutableExpectationValues, 
            max: Object.fromEntries(ObservablesWidget._EXP_KEYS.map(key => [key, 0])) as MutableExpectationValues});
        this.#currentMinMax = minMax;
        const ctx = this.#canvas.getContext("2d");
        if (this.#observableType === "E")
            this.#adaptedERange = this._drawPotential(ctx);
        this._drawAxes(ctx);
        this._drawTrajectories(ctx, results);
        this._createPoints();
        this._createLabels();
    }

    private _drawTrajectories(ctx: CanvasRenderingContext2D, results: Array<SimulationResult>) {
        const minMax: {min: ExpectationValues; max: ExpectationValues;} = this.#currentMinMax;
        if (!minMax)
            return;
        const isP: boolean = this.#observableType === "p";
        const xRange = this.#adaptedERange?.xRange || [minMax.min.x, minMax.max.x];
        const pRange = isP ? [minMax.min.p, minMax.max.p] : 
            (this.#adaptedERange?.eRange || [minMax.min.E, minMax.max.E])

        const xMin: number = xRange[0];
        const xMax: number = xRange[1];
        const pMin: number = pRange[0];
        const pMax: number = pRange[1];
        let idx: number = -1;
        const width = this.width - 2 * ObservablesWidget.WIDTH_OFFSET;
        const height = this.height - 2 * ObservablesWidget.HEIGHT_OFFSET;
        for (const result of results) {
            idx++;
            const params: SimulationParameters = this.#currentParameters[idx];
            const isQm: boolean = !!(params as QuantumSettings).hbar;
            ctx.beginPath();
            ctx.strokeStyle = /*ColorPalette.getColor(idx, 1)*/ params.color.toString();
            let initialized: boolean = false;
            let lastXP: [number, number] = [NaN, NaN];
            for (const timestep of result.timesteps) {
                /*
                * TODO in the residual quantum case we have actually several options here...
                *   - show the total expectation values
                *   - show quantum contributions only
                *   - show classical contributions only
                *   - show multiple(?)
                * Even in the ordinary quantum case we could show observables for the position space 
                * wave function or momentum space
                */
                const point = isQm ? (timestep as QuantumSystem).psi : (timestep as ClassicalSystem).point;
                if (!isFinite(point.x) || !isFinite(isP ? point.p : point.E) || (point.x === lastXP[0] && (!isP ? point.E ===lastXP[1] : point.p === lastXP[1] )))
                    continue;
                lastXP = [point.x, isP ? point.p : point.E];
                const x: number = ObservablesWidget.WIDTH_OFFSET + (point.x - xMin) / (xMax - xMin) * width;
                const p: number = ObservablesWidget.HEIGHT_OFFSET + (1-((isP ? point.p : point.E) - pMin) / (pMax - pMin)) * height;
                if (!initialized) {
                    ctx.moveTo(x, p);
                    initialized = true;
                } else {
                    ctx.lineTo(x, p);
                }
            }
            ctx.stroke();
        }
    }

    private _drawPotential(ctx: CanvasRenderingContext2D): {xRange: [number, number], eRange: [number, number]}|undefined {
        const minMax: {min: ExpectationValues; max: ExpectationValues;} = this.#currentMinMax;
        if (!minMax)
            return undefined;
        const xMinSet: number = minMax.min.x;
        const xMaxSet: number = minMax.max.x;
        const eMinSet: number = minMax.min.E;
        const eMaxSet: number = minMax.max.E;
        const suitableParams: SimulationParameters|undefined = this.#currentParameters.find(p => p.points && p.V);
        if (!suitableParams)
            return undefined;
        const x: Array<number> = suitableParams.points;
        const V: Array<number> = suitableParams.V;
        const minX = x[0];
        const maxX = x[x.length-1];
        const min = Math.max(minX, xMinSet - 0.3 * Math.abs(xMinSet));
        const max = Math.min(maxX, xMaxSet + 0.3 * Math.abs(xMaxSet));
        const maxV = Math.max(Math.max(...V), eMaxSet);
        const minV = Math.min(Math.min(...V), eMinSet);
        ctx.beginPath();
        ctx.strokeStyle = "black"; // ?
        let initialized: boolean = false;
        const width = this.width - 2 * ObservablesWidget.WIDTH_OFFSET;
        const height = this.height - 2 * ObservablesWidget.HEIGHT_OFFSET;
        for (let idx=0; idx<x.length; idx++) {
            const x0: number = x[idx];
            if (x0 < min)
                continue;
            if (x0 > max)
                break;
            const val: number = V[idx];
            const xPx: number = ObservablesWidget.WIDTH_OFFSET + (x0 - min) / (max - min) * width
            const yPx: number = ObservablesWidget.HEIGHT_OFFSET + (1-((val - minV) / (maxV - minV))) * height;
            if (!initialized) {
                ctx.moveTo(xPx, yPx);
                initialized = true;
            } else {
                ctx.lineTo(xPx, yPx);
            }
        }
        ctx.stroke();
        return {xRange: [min, max], eRange: [minV, maxV]};
    }

    private _createPoints() {
        this.#currentPoints = this.#currentParameters?.map(param => {
            const point = JsUtils.createElement("div", {parent: this.#container, classes: ["current-point", "position-absolute"]});
            point.style.borderColor = param.color.toString();
            return point;
        });
    }

    private _createLabels() {
        this.#currentParameters?.forEach(param => {
            const colorEl: HTMLElement = JsUtils.createElement("div", {parent: this.#legendGrid, html: "&#8212;"});
            colorEl.style.color = param.color.toString();
            colorEl.style.fontSize = "24px";
            const text: HTMLElement = JsUtils.createElement("div", {parent: this.#legendGrid, text: param.id});
            JsUtils.createElement("div", {parent: this.#legendGrid});
        });
    }

    set(state: Array<SimulationSystem>): void {
        const minMax: {min: ExpectationValues; max: ExpectationValues;} = this.#currentMinMax;
        if (!minMax)
            return;
        const isP = this.#observableType === "p";
        const xRange = this.#adaptedERange?.xRange || [minMax.min.x, minMax.max.x];
        const pRange = this.#observableType === "p" ? [minMax.min.p, minMax.max.p] : 
            (this.#adaptedERange?.eRange || [minMax.min.E, minMax.max.E])
        const points: Array<Partial<ExpectationValues>> = state.map(system => {
            const isQm: boolean = !!(system as QuantumSystem).psi;
            if (isQm)
                return (system as QuantumSystem).psi; // TODO phi expectation values?
            return (system as ClassicalSystem).point; 
        });
        
        const width = this.width - 2 * ObservablesWidget.WIDTH_OFFSET;
        const height = this.height - 2 * ObservablesWidget.HEIGHT_OFFSET;
        points.forEach((point, idx) => {
            if (!(this.#currentPoints?.length > idx))
                return;
            const x: number = point.x;
            const p: number = isP ? point.p : point.E;
            // TODO what if p (E) is undefined?
            const style: CSSStyleDeclaration = this.#currentPoints[idx].style;
            // 5 is the border radius of the point div 
            style.top = (ObservablesWidget.HEIGHT_OFFSET + (1-(p - pRange[0]) / (pRange[1]-pRange[0])) * height - 5) + "px";
            style.left = (ObservablesWidget.WIDTH_OFFSET + (x - xRange[0]) / (xRange[1]-xRange[0]) * width - 5) + "px";
        });
    }

    // TODO keepSlices!?
    clear(keepSlices?: boolean): void {
        this.#canvas.getContext("2d").clearRect(0, 0, this.#canvas.width, this.#canvas.height);
        this.#currentPoints?.splice(0, this.#currentPoints?.length||0)?.forEach(p => p.remove());
        this.#currentMinMax = undefined;
        this.#currentParameters = undefined;
        for (const c of Array.from(this.#legendGrid.children)) {
            c.remove();
        }
    }

}
