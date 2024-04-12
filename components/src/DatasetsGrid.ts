import { ColorRgba } from "./Color.js";
import { JsUtils } from "./JsUtils.js";
import { Potential, QuantumSettings, SimulationParameters, SimulationResult, SimulationResultClassical, SimulationResultQm } from "./types.js";

/**
 * Dataset displayed in menu
 */
export class DatasetsGrid extends HTMLElement {

    private static DEFAULT_TAG: string = "datasets-grid";
    private static _tag: string|undefined;

    static get observedAttributes(): Array<string> {
        return []; 
    }

    /**
     * Call once to register the new tag type "<datasets-grid></datasets-grid>"
     * @param tag 
     */
    static register(tag?: string) {
        tag = tag || DatasetsGrid.DEFAULT_TAG;
        if (tag !== DatasetsGrid._tag) {
            customElements.define(tag, DatasetsGrid);
            DatasetsGrid._tag = tag;
        }
    }

    /**
     * Retrieve the registered tag type for this element type, or undefined if not registered yet.
     */
    static tag(): string|undefined {
        return DatasetsGrid._tag;
    }

    constructor() {
        super();
        const style: HTMLStyleElement = document.createElement("style");
        style.textContent = ".dataset-container { padding-left: 0.2em; } "
            + ".title-container { display: flex; column-gap: 1em;}";
        const shadow: ShadowRoot = this.attachShadow({mode: "open"});
        shadow.appendChild(style);
    }

    addResultDataset(result: SimulationResult, settings: SimulationParameters) {
        const isQuantum: boolean = settings.type === "qm";
        const frag: DocumentFragment = document.createDocumentFragment();

        const titleContainer = JsUtils.createElement("div", {parent: frag, classes: ["title-container"], dataset: new Map([["id", result.id]])});
        // title
        JsUtils.createElement("div", {text: result.id, parent: titleContainer});
        const colorPickerParent = JsUtils.createElement("div", {parent: titleContainer});
        import("toolcool-color-picker").then(() => {
            const colorPicker = JsUtils.createElement("toolcool-color-picker" as any, {parent: colorPickerParent});
            colorPicker.color = settings.color.toString();
            colorPicker.addEventListener("change", (event: CustomEvent<{rgba: string}>) => 
                this.dispatchEvent(new CustomEvent<{color: ColorRgba, id: string}>("colorChange", { detail: {
                    color: new ColorRgba(event.detail.rgba),
                    id: result.id
                }})));
        });
        const deleteBtn = JsUtils.createElement("input", {parent: JsUtils.createElement("div", {parent: titleContainer}),
                text: "delete", title: "Remove this dataset", attributes: new Map([["type", "button"]])}); 
        deleteBtn.addEventListener("click", () => this.removeResultDataset(result.id));
        
        const container: HTMLElement = JsUtils.createElement("div", {parent: frag, dataset: new Map([["id", result.id]]), classes: ["dataset-container"]});
        const list = JsUtils.createElement("ul", {parent: container});
        JsUtils.createElement("li", {text: "Potential: " + DatasetsGrid._printPotential(settings), parent: list});
        JsUtils.createElement("li", {text: "Type: " + (settings.type ? settings.type : isQuantum ? "qm" : "classical"), parent: list});
        //@ts-ignore
        JsUtils.createElement("li", {text: "Scheme: " + settings.scheme.id, parent: list});
        if (isQuantum)
            JsUtils.createElement("li", {html: "&hbar; = " + (settings as QuantumSettings).hbar, parent: list});
        JsUtils.createElement("li", {html: "&Delta;t = " + settings.deltaT?.toPrecision(2), parent: list});
        const timesteps: number = isQuantum ? (result as SimulationResultQm).timesteps.length : (result as SimulationResultClassical).timesteps.length;
        JsUtils.createElement("li", {text: "time steps = " + timesteps, parent: list});
        JsUtils.createElement("li", {text: "T = " + (settings.deltaT * timesteps).toPrecision(4), parent: list});
        if (isQuantum) {
            const r = result as SimulationResultQm;
            const deltaX = r.x[1] - r.x[1];
            JsUtils.createElement("li", {html: "&Delta;x = " + deltaX.toPrecision(2) || "?", parent: list});
            JsUtils.createElement("li", {text: "grid points = " + r.x.length, parent: list});
            JsUtils.createElement("li", {text: "x_range = [" + r.x[0].toPrecision(2) + " - " + r.x[r.x.length-1].toPrecision(2) + "]", parent: list});
        }
        this.shadowRoot.appendChild(frag);
    } 

    removeResultDataset(id: string) {
        this.dispatchEvent(new CustomEvent<string>("deleted", {detail: id}));
        this.shadowRoot.querySelectorAll("[data-id='"+ id + "']").forEach(el => el.remove());
    } 

/*
     * TODO we could use MathML here for nicer presentation
     * <math>
        <mfrac>
          <mn>1</mn>
          <msqrt>
            <mn>2</mn>
          </msqrt>
        </mfrac>
      </math>
     */
    private static _printPotential(V: Potential&{V_label?: string}): string {
        if (!!V.V_coefficients) {  // polynomial
            let result = "V(x) = ";
            let idx = 0;
            let contentPrinted: boolean = false;
            for (let c of V.V_coefficients) {
                if (c != 0) {
                    let hasPrefix = false;
                    if (contentPrinted && c > 0)
                        result += "+";
                    if (idx >= 2) {
                        const denominator = DatasetsGrid._factorialize(idx);
                        if (denominator === c) {
                            //
                        } else if (denominator % c === 0) {
                            result += "1/" + (denominator/c);
                            hasPrefix = true;
                        } else {
                            result += c + "/" + denominator;
                            hasPrefix = true;
                        }
                    } else if (c != 1) {
                        result += c
                        hasPrefix = true;
                    }
                    contentPrinted = true;
                    if (idx === 0)
                        continue;
                    if (hasPrefix)
                        result += "*"
                    result += "x";
                    if (idx >= 2)
                        result += "^" + idx;
                }
                idx++;
            }
            return result;
        }
        if (V.V_label)
            return V.V_label;
        if (!!V.points && !!V.V) {  // sampled values
            const values: Array<number> = V.V;
            const points: Array<number> = V.points;
            const l: number = values.length;
            if (l < 10)
                return "{" + values.map((v, idx) => points[idx] + " => " + v).join(", ") + "}"
            const delta = Math.floor(l / 10);
            const indices = [...Array(9).keys()].map(idx => idx * delta);
            indices.push(l-1);
            return "{" + indices.map(idx => points[idx] + " => " + values[idx]).join(", ") + "}"
        }
    }

    private static _factorialize(num: number): number {
        if (num === 0)
            return 1;
        let result = num;
        for (let lower = num - 1; lower >= 1; lower--) {
            result = result * lower;
        }
        return result;
    }

}