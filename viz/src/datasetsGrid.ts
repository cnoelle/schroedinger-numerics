import { JsUtils } from "./JsUtils.js";
import { ClassicalSimulationResult, QuantumSimulationResult, TypesUtils } from "./types.js";

/**
 * List of datasets shown in menu
 */
export class DatasetsGrid {

    readonly #element: HTMLElement

    constructor() {
        this.#element = document.querySelector("#datasetsGrid");
    }

    addResultDataset(result: QuantumSimulationResult|ClassicalSimulationResult) {
        const isQuantum: boolean = !!(result as QuantumSimulationResult).waveFunction;
        const frag: DocumentFragment = document.createDocumentFragment();
        JsUtils.createElement("div", {text: result.id, parent: frag, dataset: new Map([["id", result.id]])});
        const container: HTMLElement = JsUtils.createElement("div", {parent: frag, dataset: new Map([["id", result.id]]), classes: ["dataset-container"]});
        const list = JsUtils.createElement("ul", {parent: container});
        JsUtils.createElement("li", {text: "Potential: " + TypesUtils.printPotential(result.settings), parent: list});
        JsUtils.createElement("li", {text: "Type: " + (result.settings.type ? result.settings.type : isQuantum ? "qm" : "classical"), parent: list});
        //@ts-ignore
        JsUtils.createElement("li", {text: "Scheme: " + result.settings.scheme.id, parent: list});
        if (isQuantum)
            JsUtils.createElement("li", {html: "&hbar; = " + (result as QuantumSimulationResult).settings.hbar, parent: list});
        JsUtils.createElement("li", {html: "&Delta;t = " + result.settings.deltaT?.toPrecision(2), parent: list});
        const timesteps: number = isQuantum ? (result as QuantumSimulationResult).waveFunction.length : (result as ClassicalSimulationResult).points.length;
        JsUtils.createElement("li", {text: "time steps = " + timesteps, parent: list});
        JsUtils.createElement("li", {text: "T = " + (result.settings.deltaT * timesteps).toPrecision(4), parent: list});
        if (isQuantum) {
            const r = result as QuantumSimulationResult;
            JsUtils.createElement("li", {html: "&Delta;x = " + r.settings.deltaX?.toPrecision(2) || "?", parent: list});
            JsUtils.createElement("li", {text: "grid points = " + r.x.length, parent: list});
            JsUtils.createElement("li", {text: "x_range = [" + r.x[0].toPrecision(2) + " - " + r.x[r.x.length-1].toPrecision(2) + "]", parent: list});
        }
        this.#element.appendChild(frag);
    } 

    removeResultDataset(id: string) {
        this.#element.querySelectorAll("[data-id='"+ id + "']").forEach(el => el.remove());
    } 

}