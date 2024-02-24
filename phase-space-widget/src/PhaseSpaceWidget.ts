/**
 * A webcomponent that displays a phase space density, e.g., the absolute value of a wave function.
 */
export class PhaseSpaceWidget extends HTMLElement {

    private static DEFAULT_TAG: string = "phase-space";
    private static _tag: string|undefined;

    static get observedAttributes() {
        return ["boundary", "color", "grid", "grid-line-width", "width", "height"]; 
    }

    /**
     * Call once to register the new tag type "<canvas2d-zoom></canvas2d-zoom>"
     * @param tag 
     */
    static register(tag?: string) {
        tag = tag || PhaseSpaceWidget.DEFAULT_TAG;
        if (tag !== PhaseSpaceWidget._tag) {
            customElements.define(tag, PhaseSpaceWidget);
            PhaseSpaceWidget._tag = tag;
        }
    }

    /**
     * Retrieve the registered tag type for this element type, or undefined if not registered yet.
     */
    static tag(): string|undefined {
        return PhaseSpaceWidget._tag;
    }

    readonly #canvas: HTMLCanvasElement;
    readonly #offscreen: OffscreenCanvas;
    #color: DensityColor = new DensityColor([255, 0, 0, 1]); // initial value: red
    #currentValues: Density|undefined;
    #grid: boolean = false;
    #gridLineWidth: number = 0.5;

    // size of boundary for axis labels and title in case of #grid = true
    #boundary: number = 50;

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

    // TODO adapt canvas width and height according to the dimensions provided?
    set values(values: Density|undefined) {
        this.#currentValues = values;
    }

    get values(): Density|undefined {
        return this.#currentValues;
    }

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



    /**
     * Clear canvas
     */
    clear() {
        const ctx: CanvasRenderingContext2D = this.#canvas.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    draw() {
        if (this.#currentValues === undefined) {
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
        const density: Density = this.#currentValues!;
        // TODO try to avoid allocating over and over again
        const imageData: ImageData = ctx.createImageData(width, height);
        const data: Uint8ClampedArray = imageData.data;
        const color = [...this.#color.rgba];
        const alphaBase = color[3];
        for (let idxY=0; idxY<density.dimY; idxY++) {
            const dataRowStartIdx = idxY * density.dimX * 4;
            const valuesRowStartIdx = idxY * density.dimX;
            for (let idxX=0; idxX<density.dimX; idxX++) {
                const value = density.values[valuesRowStartIdx + idxX];
                const fraction = value / density.maxValue;
                color[3] = fraction * alphaBase * 255;
                data.set(color, dataRowStartIdx + idxX *4);
            }
        }
        ctx.putImageData(imageData, 0, 0);
        this.clear();
        if (this.#grid)
            this._drawGrid(width, height, density.xRange, density.pRange);
        canvas.getContext("2d").drawImage(offscreen, offset, 0);
    }
    
    private _drawGrid(width: number, height: number, x: [number, number]|undefined, p: [number, number]|undefined,
            xTicks: number = 5, pTicks: number = 5, xGridLines: number = 5, pGridLines: number = 5) {
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
                ctx.fillText(value + "", xPos, height + 15);
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
                ctx.fillText(value + "", offsetX - 10, pPos);
            }
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "1.3em sans-serif";
        ctx.fillText("x", offsetX + width/2, height + 35);
        ctx.fillText("p", offsetX - 35, height/2);
        ctx.font = "10px sans-serif"; 
    }

    async attributeChangedCallback(name: string, oldValue: string|null, newValue: string|null) {
        const attr: string = name.toLowerCase();
        switch (attr) {
            case "boundary":
                this.boundary = parseFloat(newValue);
                break;
            case "color":
                this.color = newValue;
                break;
            case "grid":
                this.#grid = !!newValue;
                break;
            case "grid-line-width":
                this.gridLineWidth = parseFloat(newValue);
                break;
            default:
                this.#canvas.setAttribute(name, newValue);
        }
    }

}

export class Density {

    readonly values: ArrayLike<number>;
    readonly dimX: number;
    readonly dimY: number;
    readonly maxValue: number;
    readonly xRange: [number, number]|undefined;
    readonly pRange: [number, number]|undefined;

    constructor(values: ArrayLike<number>, dimX: number, options?: Partial<{
                maxValue: number, xRange: [number, number], pRange: [number, number]}>) {
        this.values = values;
        this.dimX = dimX;
        if (values.length % this.dimX !== 0)
            throw new Error("Array length " + values.length + " not divisible by dimX: " + dimX);
        const maxValue = options?.maxValue || 255;
        this.dimY = values.length/dimX;
        this.maxValue = maxValue;
        this.xRange = options?.xRange;
        this.pRange = options?.pRange;
    }

}

export class DensityColor {

    readonly rgba: Readonly<[number, number, number, number]>;

    constructor(rgba: Readonly<[number, number, number, number]>|string) {
        if (typeof rgba === "string")
            rgba = DensityColor._parseRgbaString(rgba);
        for (let idx=0; idx<3; idx++) {
            const v = rgba[idx];
            if (!Number.isFinite(v) || v < 0 || v > 255 || !Number.isInteger(v))
                throw new Error("Invalid rgb value at position " + idx + " in rgba" + rgba);
        }
        const v = rgba[3];
        if (!Number.isFinite(v) || v < 0 || v > 1)
            throw new Error("Invalid alpha value at position rgba: " + rgba);
        this.rgba = rgba;
    }

    private static _parseRgbaString(rgba: string): [number, number, number, number] {
        const rgba0 = rgba;
        rgba = rgba.trim().toLowerCase();
        if (!rgba.startsWith("rgba(") || !rgba.endsWith(")"))
            throw new Error("Invalid rgba color " + rgba);
        rgba = rgba.substring("rgba(".length, rgba.length-1);
        const values = rgba.split(",").map(v => Number.parseFloat(v));
        if (values.length !== 4)
            throw new Error("Invalid rgba string " + rgba0);
        return values as any;
    }

}

