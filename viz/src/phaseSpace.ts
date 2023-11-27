import { ColorPalette } from "./colorPalette.js";
import { JsUtils } from "./JsUtils.js";
import { SimulationListener, QuantumSimulationResult, Timeslice, ClassicalSimulationResult, Point } from "./types";

/**
 * Plots p over x, or E over x
 */
export class PhaseSpace implements SimulationListener {

    private static readonly WIDTH: number = 500;
    private static readonly HEIGHT: number = 500;
    private static readonly WIDTH_OFFSET: number = 50;
    private static readonly HEIGHT_OFFSET: number = 50;
    private static readonly TICKS: number = 5;

    #element: HTMLElement; // div
    #container: HTMLElement;
    #canvas: HTMLCanvasElement;
    #legendGrid: HTMLElement;
    readonly #currentPoints: Array<HTMLElement> = []; // one point per dataset
    #xRange: [number, number] = [0, 1];
    #pRange: [number, number] = [0, 1];
    #currentData: [Array<QuantumSimulationResult>, Array<ClassicalSimulationResult>]|undefined;
    #currentSlices: Array<[Timeslice, Timeslice|undefined]>|undefined;
    #currentClassicalPoints: Array<Point>|undefined = undefined;

    #width: number = PhaseSpace.WIDTH;
    #height: number = PhaseSpace.HEIGHT;
    #ticks: number = PhaseSpace.TICKS;
    #numDigitsX: number = 2;
    #numDigitsY: number = 2;

    #activeIds: Array<string> = [];

    constructor(private readonly energyOrMomentum?: boolean) {
        this.#element = document.querySelector(energyOrMomentum ? "#energy" : "#observables");
        JsUtils.createElement("h3", {text: energyOrMomentum ? "Energy" : "Phase space", parent: this.#element});
        const container: HTMLElement = JsUtils.createElement("div", {parent: this.#element, classes: ["position-relative"]});
        //const flexContainer: HTMLElement = JsUtils.createElement("div", {parent: container, classes: ["phase-space-container", "position-absolute"]});
        const canvas = JsUtils.createElement("canvas", {parent: container /*, classes: ["position-absolute"] */});
        canvas.width = PhaseSpace.WIDTH + 2 * PhaseSpace.WIDTH_OFFSET;
        canvas.height = PhaseSpace.HEIGHT + 2 * PhaseSpace.HEIGHT_OFFSET;
        canvas.classList.add("observables-canvas");

        const legend: HTMLElement = JsUtils.createElement("fieldset", { classes: ["phase-space-legend"]});
        this.#element.parentElement.insertBefore(legend, this.#element.nextElementSibling);
        const legendTitle: HTMLElement = JsUtils.createElement("legend", {parent: legend, text: "Datasets"});
        const legendGrid: HTMLElement = JsUtils.createElement("div", {parent: legend, classes: ["legend-grid"]});
        this.#legendGrid = legendGrid;

        this.#canvas = canvas;
        this.#container = container;
        const coordinate: string = energyOrMomentum ? "E": "P";
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
    }

    private _drawAxes(ctx: CanvasRenderingContext2D) {
        const startX: number = 0;
        const endX: number = this.#width + 2 * PhaseSpace.WIDTH_OFFSET;
        const usedStartX: number = PhaseSpace.WIDTH_OFFSET;
        const usedEndX: number = this.#width + PhaseSpace.WIDTH_OFFSET;
        const startY: number = this.#height + 2 * PhaseSpace.HEIGHT_OFFSET;
        const endY: number = 0;
        const usedStartY: number = this.#height + PhaseSpace.HEIGHT_OFFSET;
        const usedEndY: number = PhaseSpace.HEIGHT_OFFSET;
        ctx.strokeStyle = "black";
        // x axis
        ctx.beginPath();
        ctx.moveTo(startX, this.#height + PhaseSpace.HEIGHT_OFFSET);
        ctx.lineTo(endX, this.#height + PhaseSpace.HEIGHT_OFFSET);
           // arrow
        ctx.moveTo(endX, this.#height + PhaseSpace.HEIGHT_OFFSET);
        ctx.lineTo(endX - PhaseSpace.WIDTH_OFFSET/4, this.#height + PhaseSpace.HEIGHT_OFFSET + PhaseSpace.HEIGHT_OFFSET / 8);
        ctx.moveTo(endX, this.#height + PhaseSpace.HEIGHT_OFFSET);
        ctx.lineTo(endX - PhaseSpace.WIDTH_OFFSET/4, this.#height + PhaseSpace.HEIGHT_OFFSET - PhaseSpace.HEIGHT_OFFSET / 8);
        ctx.stroke();
        // y axis
        ctx.beginPath();
        ctx.moveTo(PhaseSpace.WIDTH_OFFSET, startY);
        ctx.lineTo(PhaseSpace.WIDTH_OFFSET, endY);
        // arrow
        ctx.moveTo(PhaseSpace.WIDTH_OFFSET, endY);
        ctx.lineTo(PhaseSpace.WIDTH_OFFSET - PhaseSpace.WIDTH_OFFSET/8, endY + PhaseSpace.HEIGHT_OFFSET / 4);
        ctx.moveTo(PhaseSpace.WIDTH_OFFSET, endY);
        ctx.lineTo(PhaseSpace.WIDTH_OFFSET + PhaseSpace.WIDTH_OFFSET/8, endY + PhaseSpace.HEIGHT_OFFSET / 4);

        ctx.stroke();
        // x, p ticks
        ctx.beginPath();
        const ticks: number = this.#ticks;
        const tickSpacingX: number = (usedEndX - usedStartX)/ticks;
        const tickLengthX: number = PhaseSpace.HEIGHT_OFFSET/5;
        const tickSpacingY: number = (usedEndY - usedStartY)/ticks;
        const tickLengthY: number = PhaseSpace.WIDTH_OFFSET/5;
        for (let idx=1; idx<=ticks; idx++) {
            const x: number = usedStartX + idx * tickSpacingX;
            ctx.moveTo(x, this.#height + PhaseSpace.HEIGHT_OFFSET);
            ctx.lineTo(x, this.#height + PhaseSpace.HEIGHT_OFFSET + tickLengthX);
            const y: number = usedStartY + idx * tickSpacingY;
            ctx.moveTo(PhaseSpace.WIDTH_OFFSET, y);
            ctx.lineTo(PhaseSpace.WIDTH_OFFSET-tickLengthY, y);
        }
        ctx.stroke();
        ctx.font = "16px serif";
        for (let idx=0; idx<=ticks; idx++) {
            const x: number = usedStartX + idx * tickSpacingX;
            const value: number = this.#xRange[0] + idx / ticks * (this.#xRange[1] - this.#xRange[0]);
            ctx.fillText(JsUtils.formatNumber(value, this.#numDigitsX), x - tickLengthY, this.#height + PhaseSpace.HEIGHT_OFFSET + 2.5 * tickLengthX);
            const y: number = usedStartY + idx * tickSpacingY;
            const valueY: number = this.#pRange[0] + idx/ticks * (this.#pRange[1] - this.#pRange[0]);
            const yPositionOffset: number = idx === 0 ? -tickLengthY/2 : tickLengthY/2; // avoid overlap with x-axis
            ctx.fillText(JsUtils.formatNumber(valueY, this.#numDigitsY), PhaseSpace.WIDTH_OFFSET - 4.5 * tickLengthY, y + yPositionOffset);
        }
        // axis labels
        ctx.font = "bold 20px serif";
        ctx.fillText("x", this.#width + 2 * PhaseSpace.WIDTH_OFFSET - 1.2 * tickLengthY, this.#height + PhaseSpace.HEIGHT_OFFSET + 2 * tickLengthX);
        ctx.fillText(this.energyOrMomentum ? "E" : "p", PhaseSpace.WIDTH_OFFSET - 2.2 * tickLengthY, 1.4 * tickLengthX);
    }

    initialize(qmResults: QuantumSimulationResult[], classicalResults: Array<ClassicalSimulationResult>,
            keepSlices?: boolean,
            ranges?: {x?: [number, number], p?: [number, number]}): void {
        this.clear(keepSlices);
        this.#currentData = [qmResults, classicalResults];
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
                    const xPx: number = PhaseSpace.WIDTH_OFFSET + (x - xMin) / (xMax - xMin) * this.#width
                    const yPx: number = PhaseSpace.HEIGHT_OFFSET + (1-((val - pMin) / (pMax - pMin))) * this.#height;
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
                const x: number = PhaseSpace.WIDTH_OFFSET + (point.x - xMin) / (xMax - xMin) * this.#width;
                const p: number = PhaseSpace.HEIGHT_OFFSET + (1-((eOrP ? point.E : point.p) - pMin) / (pMax - pMin)) * this.#height;
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

    scale(scale: number): void {
    }

    next(slices: [Timeslice, Timeslice|undefined][], points: Array<Point>): void {
        this.#currentSlices = slices;
        this.#currentClassicalPoints = points;
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
            style.top = (PhaseSpace.HEIGHT_OFFSET + (1-(p - this.#pRange[0]) / (this.#pRange[1]-this.#pRange[0])) * this.#height - 5) + "px";
            style.left = (PhaseSpace.WIDTH_OFFSET + (x - this.#xRange[0]) / (this.#xRange[1]-this.#xRange[0]) * this.#width - 5) + "px";
        });
    }

    clear(keepSlices?: boolean): void {
        this.#canvas.getContext("2d").clearRect(0, 0, this.#canvas.width, this.#canvas.height);
        this.#currentPoints.splice(0, this.#currentPoints.length).forEach(p => p.remove());
        this.#currentData = undefined;
        if (!keepSlices) {
            this.#currentSlices = undefined;
            this.#currentClassicalPoints = undefined;
        }
    }

}
