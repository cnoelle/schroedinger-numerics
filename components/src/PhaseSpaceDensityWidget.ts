import { JsUtils } from "./JsUtils.js";
import { Coordinates, QmWidget, QuantumSettings, QuantumSystem, QuantumSystemResidual, SimulationParameters, SimulationSystem, VisualizationSettings, WaveFunctionData } from "./types.js";

/**
 * A webcomponent that displays a phase space density derived from the absolute values 
 * of a wave function in position space and momentum space
 * TODO support multiple wave functions!
 */
export class PhaseSpaceDensityWidget extends HTMLElement implements QmWidget {

    private static DEFAULT_TAG: string = "phase-space";
    private static _tag: string|undefined;

    static get observedAttributes() {
        return ["boundary", "grid", "grid-line-width", "width", "height", "wave-function-type"]; 
    }

    /**
     * Call once to register the new tag type "<canvas2d-zoom></canvas2d-zoom>"
     * @param tag 
     */
    static register(tag?: string) {
        tag = tag || PhaseSpaceDensityWidget.DEFAULT_TAG;
        if (tag !== PhaseSpaceDensityWidget._tag) {
            customElements.define(tag, PhaseSpaceDensityWidget);
            PhaseSpaceDensityWidget._tag = tag;
        }
    }

    /**
     * Retrieve the registered tag type for this element type, or undefined if not registered yet.
     */
    static tag(): string|undefined {
        return PhaseSpaceDensityWidget._tag;
    }

    readonly #canvas: HTMLCanvasElement;
    readonly #offscreen: OffscreenCanvas;
    /*#color: ColorRgba = new DensityColor([255, 0, 0, 1]); // initial value: red*/
    //#currentValues: Density|undefined;
    #waveFunctionType: "psi"|"phi" = "psi";
    #currentParameters: Array<QuantumSettings&VisualizationSettings>;

    #grid: boolean = false;
    #gridLineWidth: number = 0.5;

    // size of boundary for axis labels and title in case of #grid = true
    #boundary: number = 50;

    // cache
    #lastImageData: ImageData|undefined;
    #lastWidth: number|undefined;
    #lastHeight: number|undefined;

    constructor() {
        super();
        // TODO react to size changes of the canvas
        const initialWidth = parseInt(this.getAttribute("width")) || 480;  // XXX?
        const initialHeight = parseInt(this.getAttribute("height")) || 240;
        this.#canvas = document.createElement("canvas");
        this.#offscreen = new OffscreenCanvas(initialWidth, initialHeight);
        
        const style: HTMLStyleElement = document.createElement("style");
        style.textContent = ":host { position: relative; display: block; }";
        const shadow: ShadowRoot = this.attachShadow({mode: "open"});
        shadow.appendChild(style);
        shadow.appendChild(this.#canvas);
    }

    connectedCallback() {
        this.#canvas.getContext("2d")!.save();
    }

    disconnectedCallback() {
        this.#canvas.getContext("2d")!.restore();
    }

    /*
    set values(values: Density|undefined) {
        this.#currentValues = values;
    }

    get values(): Density|undefined {
        return this.#currentValues;
    }
    */

    /*
    set color(color: DensityColor|string|[number, number, number, number]) {
        if (color === undefined)
            throw new Error("Color is undefined");
        if (!(color instanceof DensityColor))
            color = new DensityColor(color as any);
        this.#color = color;
    }

    get color(): DensityColor {
        return this.#color;
    }
    */

    set grid(grid: boolean) {
        this.#grid = grid;
    }

    get grid(): boolean {
        return this.#grid;
    }

    set gridLineWidth(lineWidth: number) {
        if (lineWidth <= 0 || !Number.isFinite(lineWidth))
            throw new Error("Line width must be a positive number");
        this.#gridLineWidth = lineWidth;
    }

    get gridLineWidth(): number {
        return this.#gridLineWidth;
    }

    set boundary(boundary: number) {
        if (boundary < 0 || !Number.isFinite(boundary))
            throw new Error("Boundary must be a non-negative number");
        this.#boundary = boundary;
    }

    get boundary(): number {
        return this.#boundary;
    }

    set width(w: number) {
        this.#canvas.width = w;
    }

    get width(): number {
        return this.#canvas.width;
    }

    set height(h: number) {
        this.#canvas.height = h;
    }

    get height(): number {
        return this.#canvas.height;
    }

    set waveFunctionType(type: "psi"|"phi") {
        this.#waveFunctionType = type;
    }

    get waveFunctionType(): "psi"|"phi" {
        return this.#waveFunctionType;
    }

    /**
     * Clear canvas
     */
    clear() {
        const ctx: CanvasRenderingContext2D = this.#canvas.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    initialize(settings: Array<SimulationParameters>): void {
        // @ts-ignore
        this.#currentParameters = settings.filter(s => s.type === "qm");
        this.clear();
    }

    set(state: Array<SimulationSystem>): void {
        if (!(this.#currentParameters?.length > 0) || !(state?.length > 0)) {
            this.clear();
            return;
        }
        const canvas = this.#canvas;
        const offset: number = this.#grid ? this.#boundary : 0;
        const width = canvas.width - offset;
        const height = canvas.height - offset;
        const offscreen = this.#offscreen;
        if (offscreen.width !== width)
            offscreen.width = width;
        if (offscreen.height !== height)
            offscreen.height = height;
        const ctx = offscreen.getContext("2d");
        const dimsUnchanged = this.#lastWidth === width && this.#lastHeight === height;
        // try to avoid allocating over and over again
        const imageData: ImageData = dimsUnchanged ? this.#lastImageData : ctx.createImageData(width, height);
        if (!dimsUnchanged) {
            this.#lastWidth = width;
            this.#lastHeight = height;
            this.#lastImageData = imageData;
        }
        const data: Uint8ClampedArray = imageData.data;
        this.clear();
        let idx=-1;
        const quantumSystems: Array<QuantumSystem&{psiCoordinates: Coordinates}> = state
            .filter(r => !!(r as {psiCoordinates: Coordinates}).psiCoordinates) as any;
        let xMin, xMax, pMin, pMax;
        for (const result of quantumSystems) {
            idx++;
            const color = [...this.#currentParameters[idx].color.rgba];
            const alphaBase = color[3];
            const wavefunctionX: WaveFunctionData = this.#waveFunctionType === "phi" ? 
                (result as any as QuantumSystemResidual).phi : result.psi;
            const wavefunctionP: WaveFunctionData = this.#waveFunctionType === "phi" ? 
                (result as any as QuantumSystemResidual).phiP : result.psiP;
            if (!wavefunctionX || !wavefunctionP)
                continue;
            const x = wavefunctionX.basePoints;
            const p = wavefunctionP.basePoints;
            const xLength = x.length;
            const pLength = p.length;
            if (xMin === undefined) {
                xMin = x[0]; 
                xMax = x[xLength-1];
                pMin = p[0];
                pMax = p[pLength-1];
            }
            // sqrt?
            const pAbsValues = wavefunctionP.values.map(v => v[0]*v[0] + v[1]*v[1]);
            const xAbsValues = wavefunctionX.values.map(v => v[0]*v[0] + v[1]*v[1]);
            const max = Math.max(...pAbsValues) * Math.max(...xAbsValues);
            for (let idxP = 0; idxP < pLength; idxP++) {
                const dataRowStartIdx = idxP * xLength * 4;
                const valuesRowStartIdx = idxP * xLength;
                const pAbs = pAbsValues[idxP];
                for (let idxX=0; idxX<xLength; idxX++) {
                    const xAbs = xAbsValues[idxX];
                    const value = pAbs * xAbs;
                    const fraction = value / max;
                    color[3] = fraction * alphaBase * 255;
                    data.set(color, dataRowStartIdx + idxX *4);
                }
            }
            // XXX for multiple wave function this simply overrides the former results
            ctx.putImageData(imageData, 0, 0);
        }
        if (this.#grid) {
            const hbarSqrt = Math.sqrt(this.#currentParameters[0].hbar);
            let xGridLines = Math.floor((xMax + 1 - xMin) / hbarSqrt);
            let pGridLines = Math.floor((pMax + 1 - pMin) / hbarSqrt);
            //const xGridLines: number = density.cellsX ? density.cellsX + 1 : 5;
            //const pGridLines: number = density.cellsP ? density.cellsP + 1 : 5;
            // TODO else?
            if (xGridLines > 0 && pGridLines > 0 && xGridLines < 100 && pGridLines < 100) {
                this._drawGrid(width, height, {x: [xMin, xMax], p: [pMin, pMax],
                    xGridLines: xGridLines, pGridLines: pGridLines});
            }
        }
        canvas.getContext("2d").drawImage(offscreen, offset, 0);
    }
    
    private _drawGrid(width: number, height: number, options?: Partial<{x: [number, number]; p: [number, number];
                    xTicks: number; pTicks: number; xGridLines: number; pGridLines: number;
            }>) {
        const x = options?.x;
        const p = options?.p;
        let xGridLines = options?.xGridLines || 5;
        let pGridLines = options?.pGridLines || 5;
        while (xGridLines > width/5)
            xGridLines = Math.max(Math.floor(xGridLines/10), 5);
        while (pGridLines > height/5)
            pGridLines = Math.max(Math.floor(pGridLines/10), 5);
        const xTicks = options?.xTicks || Math.min(xGridLines, 5);
        const pTicks = options?.pTicks || Math.min(pGridLines, 5);
        const offsetX = this.#boundary;
        const deltaXPixels = width / (xGridLines - 1);
        const deltaPPixels = height / (pGridLines - 1);
        const ctx = this.#canvas.getContext("2d")!;
        ctx.lineWidth = this.#gridLineWidth;
        for (let idx=0; idx<xGridLines; idx++) {
            const xPos = idx * deltaXPixels + offsetX;
            ctx.beginPath();
            ctx.moveTo(xPos, 0);
            ctx.lineTo(xPos, height);
            ctx.stroke();
        }
        for (let idx=0; idx<pGridLines; idx++) {
            const pPos = idx * deltaPPixels;
            ctx.beginPath();
            ctx.moveTo(offsetX, pPos);
            ctx.lineTo(offsetX + width, pPos);
            ctx.stroke();
        }
        //ctx.font = "";
        const measure = ctx.measureText("abc");
        measure.width;
        if (x && xTicks > 1) {
            const deltaXPixels = width / (xTicks - 1);
            const deltaXValues = (x[1] - x[0]) / (xTicks - 1);
            for (let idx=0; idx<xTicks; idx++) {
                const xPos = idx * deltaXPixels + offsetX;
                const value: number = x[0] + idx * deltaXValues;
                if (idx === 0)
                    ctx.textAlign = "left";
                else if (idx === xTicks - 1)
                    ctx.textAlign = "right";
                else
                    ctx.textAlign = "center";
                ctx.fillText(JsUtils.formatNumber(value), xPos, height + 15);
            }
        }
        if (p && pTicks > 1) {
            const deltaPPixels = height / (pTicks - 1);
            const deltaPValues = (p[1] - p[0]) / (pTicks - 1);
            for (let idx=0; idx<pTicks; idx++) {
                const pPos = height - idx * deltaPPixels;
                const value: number = p[0] + idx * deltaPValues;
                if (idx === 0)
                    ctx.textBaseline = "bottom";
                else if (idx === xTicks - 1)
                    ctx.textBaseline = "top";
                else
                    ctx.textBaseline = "middle";
                ctx.fillText(JsUtils.formatNumber(value), offsetX - 10, pPos);
            }
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "1.3em sans-serif";
        ctx.fillText("x", offsetX + width/2, height + 35);
        ctx.fillText("p", offsetX - 35, height/2);
        ctx.font = "10px sans-serif"; 
    }

    attributeChangedCallback(name: string, oldValue: string|null, newValue: string|null) {
        const attr: string = name.toLowerCase();
        switch (attr) {
            case "boundary":
                this.boundary = parseFloat(newValue);
                break;
                /*
            case "color":
                this.color = newValue;
                break;
                */
            case "grid":
                this.#grid = !!newValue;
                break;
            case "grid-line-width":
                this.gridLineWidth = parseFloat(newValue);
                break;
            case "wave-function-type":
                newValue = newValue?.toLowerCase();
                if (newValue === "psi" || newValue === "phi")
                    this.#waveFunctionType = newValue;
                break;
            default:
                this.#canvas.setAttribute(name, newValue);
        }
    }

}
