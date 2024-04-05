import { JsUtils } from "./JsUtils.js";
import { QuantumSettings, SimulationParameters, SimulationResult, SimulationResultClassical, SimulationResultQm, SimulationSettings, simulationSettings } from "./types.js";

/**
 * Dataset displayed in menu
 * TODO dispatch events: color changed, dataset deleted; and handle them in controller
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

    //readonly #datasets: Array<SimulationResult> = [];

    constructor() {
        super();
        const style: HTMLStyleElement = document.createElement("style");
        style.textContent = ".dataset-container { padding-left: 0.2em; } "
            + ".title-container { display: flex; column-gap: 1em;}";
        const shadow: ShadowRoot = this.attachShadow({mode: "open"});
        shadow.appendChild(style);
    }

    /*
    addSimDataset(result: SimulationResult) {
        this.#datasets.push(result);
        this.addResultDataset(result);
    }

    removeSimDataset(result: SimulationResult) {
        const idx = this.#datasets.indexOf(result);
        if (idx > 1) {
            this.#datasets.splice(idx, 1);
            this.removeResultDataset(result.id);
        }
    }
    */

    addResultDataset(result: SimulationResult) {
        const settings: SimulationSettings = simulationSettings(result);
        const isQuantum: boolean = settings.type === "qm";
        const frag: DocumentFragment = document.createDocumentFragment();

        const titleContainer = JsUtils.createElement("div", {parent: frag, classes: ["title-container"], dataset: new Map([["id", result.id]])});
        // title
        JsUtils.createElement("div", {text: result.id, parent: titleContainer});
        JsUtils.createElement("div", {parent: titleContainer}); // TODO color selection
        const deleteBtn = JsUtils.createElement("input", {parent: JsUtils.createElement("div", {parent: titleContainer}),
                text: "delete", title: "Remove this dataset", attributes: new Map([["type", "button"]])}); 
        deleteBtn.addEventListener("click", () => this.removeResultDataset(result.id));
        
        const container: HTMLElement = JsUtils.createElement("div", {parent: frag, dataset: new Map([["id", result.id]]), classes: ["dataset-container"]});
        const list = JsUtils.createElement("ul", {parent: container});
        // TODO
        //JsUtils.createElement("li", {text: "Potential: " + TypesUtils.printPotential(settings), parent: list});
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
        // TODO handle event!
        this.dispatchEvent(new CustomEvent<string>("deleted", {detail: id}));
        this.shadowRoot.querySelectorAll("[data-id='"+ id + "']").forEach(el => el.remove());
    } 

}