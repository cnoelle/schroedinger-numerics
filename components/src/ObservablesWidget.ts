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
export class ObservablesWidget extends HTMLElement implements QmWidget {

    private static DEFAULT_TAG: string = "observables-widget";
    private static _tag: string|undefined;
    private static readonly _EXP_KEYS: Array<keyof ExpectationValues> = ["x", "p", "E", "x2", "p2"];

    static get observedAttributes() {
        return ["width", "height", /* "wave-function-type", "representation", */
            "observable-type", "title"]; 
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

    set title(title: string|undefined) {
        this.setAttribute("title", title);
    }

    get title(): string|undefined {
        return this.getAttribute("title") || undefined;
    }

    /*
    set waveFunctionType(type: "psi"|"phi") {
        this.#waveFunctionType = type;
    }

    get waveFunctionType(): "psi"|"phi" {
        return this.#waveFunctionType;
    }

    set representation(representation: "x"|"p") {
        this.#representation = representation;
    }

    get representation(): "x"|"p" {
        return this.#representation
    }
    */

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
                this.#observableType = newValue;
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
        /*
        case "representation":
            if (newValue === "x" || newValue === "p")
                this.representation = newValue;
            break;
        case "wave-function-type":
            newValue = newValue?.toLowerCase();
            if (newValue === "psi" || newValue === "phi")
                this.#waveFunctionType = newValue;
            break;
        */
        case "title":
            this._setTitle();
            break;
        default:
        }
    }

    readonly #titleEl: HTMLDivElement;

    private _setTitle() {
        const title = this.getAttribute("title") || (this.#observableType === "p" ? "Momentum" : "Energy");
        this.#titleEl.innerText = title;
    }


    private static readonly WIDTH: number = 500;
    private static readonly HEIGHT: number = 500;
    private static readonly WIDTH_OFFSET: number = 50;
    private static readonly HEIGHT_OFFSET: number = 50;
    private static readonly TICKS: number = 5;

    readonly #canvas: HTMLCanvasElement;
    readonly #container: HTMLElement;
    readonly #legendGrid: HTMLElement;
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
        const shadow: ShadowRoot = this.attachShadow({mode: "open"});

        const style: HTMLStyleElement = document.createElement("style");
        style.textContent = ":host { position: relative; margin-left: 2em; /* min-width: 600px; */ ;} "
            + ".position-relative { position: relative; } " + 
            + ".legend-grid { display: grid; grid-template-columns: auto auto 1fr; align-items: center; column-gap: 1em; } " 
            + ".phase-space-legend { /*margin-bottom: 4em;*/ }";
        shadow.append(style);
        this.#titleEl = JsUtils.createElement("h3", {text: "Energy", parent: shadow});
        const container: HTMLElement = JsUtils.createElement("div", {parent: shadow, classes: ["position-relative"]});

        //const flexContainer: HTMLElement = JsUtils.createElement("div", {parent: container, classes: ["phase-space-container", "position-absolute"]});
        const canvas = JsUtils.createElement("canvas", {parent: container }); // TODO: class for width and height?
        canvas.width = ObservablesWidget.WIDTH + 2 * ObservablesWidget.WIDTH_OFFSET;
        canvas.height = ObservablesWidget.HEIGHT + 2 * ObservablesWidget.HEIGHT_OFFSET;


        const legend: HTMLElement = JsUtils.createElement("fieldset", { classes: ["phase-space-legend"], parent: shadow});
        // TODO?
        /*this.#element.parentElement.insertBefore(legend, this.#element.nextElementSibling);*/
        const legendTitle: HTMLElement = JsUtils.createElement("legend", {parent: legend, text: "Datasets"});
        const legendGrid: HTMLElement = JsUtils.createElement("div", {parent: legend, classes: ["legend-grid"]});
        this.#legendGrid = legendGrid;

        this.#canvas = canvas;
        this.#container = container;
                /*
        const coordinate: string = "E"; // TODO adapt on change!
        const setCoordinateRange = (range: [number, number]|undefined, xOrY: boolean) => {
            if (!this.#currentData)
                return;
            if (range !== undefined && !Array.isArray(range)) {
                console.log("Need an array of two values (min, max), got ", range);
                return;
            }
            if (Array.isArray(range) && range.length !== 2) {
                console.log("Need an array of two values (min, max), got ", range);
                return;
            }
            const coordinate: "x"|"p" = xOrY ? "x" : "p";
            const otherCoordinate: "x"|"p" = xOrY ? "p" : "x";
            const otherRange: [number, number] = xOrY ? this.#pRange : this.#xRange;
            this.initialize(this.#currentData[0], this.#currentData[1], true, {[coordinate]: range, [otherCoordinate]: otherRange});
            if (this.#currentSlices && this.#currentClassicalPoints)
                this.next(this.#currentSlices, this.#currentClassicalPoints);
        };
        // TODO need to reset points

        const debug = {
            setX: (xRange: [number, number]) => setCoordinateRange(xRange, true),
            ["set" + coordinate]: (pRange: [number, number]) => setCoordinateRange(pRange, false),
            reset: () => {
                this.initialize(this.#currentData[0], this.#currentData[1], true);
                if (this.#currentSlices && this.#currentClassicalPoints)
                    this.next(this.#currentSlices, this.#currentClassicalPoints);
            },
            setSize: (size: {width?: number, height?: number, ticks?: number, numDigitsX?: number, numDigitsY?: number}) => {
                this.#width = size.width || this.#width;
                this.#height = size.height || this.#height;
                this.#ticks = size.ticks || this.#ticks;
                this.#numDigitsX = size.numDigitsX || this.#numDigitsX;
                this.#numDigitsY = size.numDigitsY || this.#numDigitsY;
                this.initialize(this.#currentData[0], this.#currentData[1], true);
                if (this.#currentSlices && this.#currentClassicalPoints)
                    this.next(this.#currentSlices, this.#currentClassicalPoints);
            }
        };
        (window as any).sch = (window as any).sch || {};
        (window as any).sch[coordinate] = debug;
        */
    }

    private _drawAxes(ctx: CanvasRenderingContext2D) {
        const minMax: {min: ExpectationValues; max: ExpectationValues;} = this.#currentMinMax;
        if (!minMax)
            return;
        const width = this.width;  // FIXME need to 
        const height = this.height;
        const xRange = [minMax.min.x, minMax.max.x];
        const pRange = this.#observableType === "p" ? [minMax.min.p, minMax.max.p] : [minMax.min.E, minMax.max.E]
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
        // TODO draw potential, if this is energy
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
        const xMin: number = minMax.min.x;
        const xMax: number = minMax.max.x;
        const pMin: number = isP ? minMax.min.p : minMax.min.E;
        const pMax: number = isP ? minMax.max.p : minMax.max.E;
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

    /*
    initializeOld(qmResults: QuantumSimulationResult[], classicalResults: Array<ClassicalSimulationResult>,
            keepSlices?: boolean,
            ranges?: {x?: [number, number], p?: [number, number]}): void {
        this.clear(keepSlices);
        this.#currentDataOld = [qmResults, classicalResults];
        let xMin: number|undefined;
        let xMax: number|undefined;
        let pMin: number|undefined;
        let pMax: number|undefined;
        const points: Array<Array<Point>> = qmResults.map(r => r.observables);
        points.push(...classicalResults.map(r => r.points));
        const eOrP: boolean = this.energyOrMomentum;
        if (ranges?.x)
            [xMin, xMax] = ranges.x;
        if (ranges?.p)
            [pMin, pMax] = ranges.p;
        for (const arr of points) {
            for (const p of arr) {
                if (!ranges?.x && isFinite(p.x)) {
                    if (!(xMin <= p.x))
                        xMin = p.x;
                    if (!(xMax >= p.x))
                        xMax = p.x;
                }
                const val: number|undefined = eOrP ? p.E : p.p;
                if (!ranges?.p && isFinite(val)) {
                    if (!(pMin <= val))
                        pMin = val;
                    if (!(pMax >= val))
                        pMax = val;
                }
            }
        }
        // TODO round numbers
        xMin = isFinite(xMin) ? xMin : 0;
        xMax = isFinite(xMax) ? xMax : 1;
        pMin = (isFinite(pMin) && (ranges?.p || !eOrP)) ? pMin : 0;
        pMax = isFinite(pMax) ? pMax : 1;
        let potentialDrawn: boolean = false;
        const ctx: CanvasRenderingContext2D = this.#canvas.getContext("2d");
        if (this.energyOrMomentum && qmResults?.length > 0) { // plot a slightly larger domain than the actually occurring xs
            const minMaxX: Array<[number,number]> = qmResults.map(r => [r.x[0], r.x[r.x.length - 1]]);
            const min: number = minMaxX.map(mm => mm[0]).reduce((val, x) => x < val ? x : val, xMin || 0);
            const max: number = minMaxX.map(mm => mm[1]).reduce((val, x) => x > val ? x : val, xMax || 1);
            if (min < xMin) 
                xMin = Math.max(xMin - 0.3 * Math.abs(xMin), min);
            if (max > xMax)
                xMax = Math.min(xMax + 0.3 * Math.abs(xMax), max);
            // TODO adapt also pMin and pMax
            // XXX simply select the first?
            const firstResult: QuantumSimulationResult = qmResults.find(r => r.settings.V?.length === r.x.length);
            if (firstResult) {
                const containedIndices: Array<number> 
                    = firstResult.x.map((val, idx) => val >= xMin && val <= xMax ? idx : -1).filter(idx => idx >= 0);
                const maxV: number = Math.max(...firstResult.settings.V.filter((_, idx) => containedIndices.indexOf(idx) >= 0));
                if (maxV > pMax)
                    pMax = maxV;
                ctx.beginPath();
                ctx.strokeStyle = "black"; // ?
                let initialized: boolean = false;

                for (let idx=0; idx<firstResult.x.length; idx++) {
                    const x: number = firstResult.x[idx];
                    if (x < xMin)
                        continue;
                    if (x > xMax)
                        break;
                    const val: number = firstResult.settings.V[idx];
                    const xPx: number = ObservablesWidget.WIDTH_OFFSET + (x - xMin) / (xMax - xMin) * this.#width
                    const yPx: number = ObservablesWidget.HEIGHT_OFFSET + (1-((val - pMin) / (pMax - pMin))) * this.#height;
                    if (!initialized) {
                        ctx.moveTo(xPx, yPx);
                        initialized = true;
                    } else {
                        ctx.lineTo(xPx, yPx);
                    }
                }
                ctx.stroke();
                potentialDrawn = true;
            }
        }
        this.#xRange = [xMin, xMax];
        this.#pRange = [pMin, pMax];
        this._drawAxes(ctx);
        let idx: number = -1;
        for (const arr of points) {
            idx++;
            ctx.beginPath();
            ctx.strokeStyle = ColorPalette.getColor(idx, 1);
            let initialized: boolean = false;
            let lastXP: [number, number] = [NaN, NaN];
            for (const point of arr) {
                if (!isFinite(point.x) || !isFinite(eOrP ? point.E : point.p) || (point.x === lastXP[0] && (eOrP ? point.E ===lastXP[1] : point.p === lastXP[1] )))
                    continue;
                lastXP = [point.x, eOrP ? point.E : point.p];
                const x: number = ObservablesWidget.WIDTH_OFFSET + (point.x - xMin) / (xMax - xMin) * this.#width;
                const p: number = ObservablesWidget.HEIGHT_OFFSET + (1-((eOrP ? point.E : point.p) - pMin) / (pMax - pMin)) * this.#height;
                if (!initialized) {
                    ctx.moveTo(x, p);
                    initialized = true;
                } else {
                    ctx.lineTo(x, p);
                }
            }
            ctx.stroke();
        }
        idx = -1;
        for (const result of points) {
            idx++;
            const point = JsUtils.createElement("div", {parent: this.#container, classes: ["current-point", "position-absolute"]});
            point.style.borderColor = ColorPalette.getColor(idx, 0);
            this.#currentPoints.push(point);
        }
        // clear legend
        for (const c of Array.from(this.#legendGrid.children)) {
            c.remove();
        }
        idx = 0;
        for (const result of [...qmResults, ...classicalResults].map(r => r.id)) {
            const colorEl: HTMLElement = JsUtils.createElement("div", {parent: this.#legendGrid, html: "&#8212;"});
            colorEl.style.color = ColorPalette.getColor(idx++, 0);
            colorEl.style.fontSize = "24px";
            const text: HTMLElement = JsUtils.createElement("div", {parent: this.#legendGrid, text: result});
            JsUtils.createElement("div", {parent: this.#legendGrid});
        }
    }
    */

    set(state: Array<SimulationSystem>): void {
        const minMax: {min: ExpectationValues; max: ExpectationValues;} = this.#currentMinMax;
        if (!minMax)
            return;
        const isP = this.#observableType === "p";
        const xRange = [minMax.min.x, minMax.max.x];
        const pRange = isP ? [minMax.min.p, minMax.max.p] : [minMax.min.E, minMax.max.E]
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

    /*
    nextOld(slices: [Timeslice, Timeslice|undefined][], points: Array<Point>): void {
        this.#currentSlicesOld = slices;
        this.#currentClassicalPointsOld = points;
        // list of quantum expectation values <x>, <p> and classical points
        const allPoints: Array<Point> = [...slices.map(s => s[0].observables), ...points]; 
        const eOrP: boolean = this.energyOrMomentum;
        allPoints.forEach((slice, idx) => {
            if (this.#currentPoints.length <= idx)
                return;
            const x: number = slice.x;
            const p: number = eOrP ? slice.E : slice.p;
            // TODO what if p (E) is undefined?
            const style: CSSStyleDeclaration = this.#currentPoints[idx].style;
            // 5 is the border radius of the point div 
            style.top = (ObservablesWidget.HEIGHT_OFFSET + (1-(p - this.#pRange[0]) / (this.#pRange[1]-this.#pRange[0])) * this.#height - 5) + "px";
            style.left = (ObservablesWidget.WIDTH_OFFSET + (x - this.#xRange[0]) / (this.#xRange[1]-this.#xRange[0]) * this.#width - 5) + "px";
        });
    }
    */

    // TODO keepSlices!
    clear(keepSlices?: boolean): void {
        this.#canvas.getContext("2d").clearRect(0, 0, this.#canvas.width, this.#canvas.height);
        this.#currentPoints?.splice(0, this.#currentPoints?.length||0)?.forEach(p => p.remove());
        for (const c of Array.from(this.#legendGrid.children)) {
            c.remove();
        }
    }

}
