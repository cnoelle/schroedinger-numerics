/**
 * A webcomponent that displays a phase space density, e.g., the absolute value of a wave function.
 */
export class PhaseSpaceWidget extends HTMLElement {

    private static DEFAULT_TAG: string = "phase-space";
    private static _tag: string|undefined;

    static get observedAttributes() {
        return ["color",
            "width", "height", "zoom", "pan", "max-zoom", "min-zoom", "zoom-factor", "double-click-mode"]; 
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
    #color: DensityColor = new DensityColor([255, 0, 0, 1]); // initial value: red
    #currentValues: Density|undefined;

    constructor() {
        super();
        // TODO react to size changes of the canvas
        this.#canvas = document.createElement("canvas");
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
        const ctx = canvas.getContext("2d");
        const density: Density = this.#currentValues!;
        // TODO try to avoid allocating over and over again
        const imageData: ImageData = ctx.createImageData(canvas.width, canvas.height);
        const data: Uint8ClampedArray = imageData.data;
        const color = [...this.#color.rgba];
        const alphaBase = color[3];
        for (let idxY=0; idxY<density.dimX; idxY++) {
            const dataRowStartIdx = idxY * density.dimX * 4;
            const valuesRowStartIdx = idxY * density.dimX;
            for (let idxX=0; idxX<density.dimY; idxX++) {
                const value = density.values[valuesRowStartIdx + idxX];
                const fraction = value / density.maxValue;
                color[3] = fraction * alphaBase * 255;
                data.set(color, dataRowStartIdx + idxX *4);
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    async attributeChangedCallback(name: string, oldValue: string|null, newValue: string|null) {
        const attr: string = name.toLowerCase();
        switch (attr) {
            case "color":
                this.color = newValue;
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

    constructor(values: ArrayLike<number>, dimX: number, maxValue: number = 255) {
        this.values = values;
        this.dimX = dimX;
        if (values.length % this.dimX !== 0)
            throw new Error("Array length " + values.length + " not divisible by dimX: " + dimX);
        this.dimY = values.length/dimX;
        this.maxValue = maxValue;
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

