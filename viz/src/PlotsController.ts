import { DifferencePlot } from "./differencePlot.js";
import { PhaseSpace } from "./phaseSpace.js";
import { PsiPlot } from "./psiPlot.js";
import { SimulationListener } from "./types.js";

export class PlotsController {

    #psiPlot: PsiPlot;
    #psiTildePlot: PsiPlot;
    #differencePlot: DifferencePlot;
    #observablesPlot: PhaseSpace;
    #energyPlot: PhaseSpace;

    constructor(
        simulationListeners: Array<SimulationListener> // to be filled by the controller
    ) {
        this.#psiPlot = new PsiPlot();
        this.#psiTildePlot = new PsiPlot(true);
        this.#differencePlot = new DifferencePlot();
        this.#observablesPlot = new PhaseSpace();
        this.#energyPlot = new PhaseSpace(true);
        simulationListeners.push(this.#psiPlot, this.#psiTildePlot, this.#differencePlot, this.#observablesPlot, this.#energyPlot);
    }

    setMargin(margin: number): void {
        const width: number = document.body.clientWidth;
        this.#psiPlot.setWidth(width - margin);
        this.#differencePlot.setWidth(width - margin);
        // TODO this.#observablesPlot
    }



}