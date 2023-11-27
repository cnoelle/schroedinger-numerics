import { PlotsController } from "./PlotsController.js";
import { SimulationController } from "./SimulationController.js";
import { SimulationControls } from "./SimulationControls.js";
import { SimulationUtils } from "./SimulationUtils.js";
import { SimulationListener, QuantumSimulationResult, SimulationStateListener } from "./types.js";


export class Main {

    readonly #simulationListeners: Array<SimulationListener> = [];
    readonly #simulationStateListeners: Array<SimulationStateListener> = [];
    readonly #simulationController: SimulationController;
    readonly #plotsController: PlotsController;
    readonly #simulationControls: SimulationControls;

    //#activeResults: SimulationResult|null = null;
    #uploadRunning: boolean = false;

    constructor() {
        this.#simulationController = new SimulationController(this.#simulationListeners, this.#simulationStateListeners);
        this.#simulationControls = new SimulationControls(this.#simulationController);
        this.#simulationStateListeners.push(this.#simulationControls);
        this.#plotsController = new PlotsController(this.#simulationListeners);
        const fileSelector: HTMLInputElement = document.querySelector("#fileSelector");
        const fileUpload: HTMLInputElement = document.querySelector("#fileUpload");
        const enableFileUpload = (enable: boolean) => {
            fileUpload.disabled = !enable;
            fileUpload.title = enable ? "Start upload" : "Select files first";
        };
        const hideShowMenu = (show?: boolean) => {
            const menu: HTMLElement = document.querySelector("#menu");
            const viz: HTMLElement = document.querySelector("#viz");
            const hideMenu: HTMLElement = document.querySelector("#menuClose");
            const showMenu: HTMLElement = document.querySelector("#menuShow");
            if (show === undefined)
                show = menu.hidden;
            menu.hidden = !show;
            hideMenu.hidden = !show;
            showMenu.hidden = show;
            const margin: number = show ? 350 : 0;
            //viz.style.marginLeft = margin + "px";
            if (show)
                viz.classList.add("menu-margin");
            else
                viz.classList.remove("menu-margin");
            this.#plotsController.setMargin(margin);
        };
        document.querySelector("#menuClose").addEventListener("click", () => hideShowMenu(false));
        document.querySelector("#menuShow").addEventListener("click", () => hideShowMenu(true));
        fileSelector.addEventListener("change", () => enableFileUpload(fileSelector.files.length > 0));
        fileUpload.addEventListener("click", async () => {
            if (this.#uploadRunning)
                return;
            const files: Array<File> = Array.from(fileSelector.files)
                .filter(fl => fl.name.toLowerCase().endsWith(".csv") || fl.name.toLowerCase().endsWith(".json"));
            if (files.length === 0)
                return;
            const psi: File|undefined = files.find(fl => fl.name.toLowerCase() === "psi.csv");
            const observables: File|undefined = files.find(fl => fl.name.toLowerCase() === "observables.csv");
            const settings: File|undefined = files.find(fl => fl.name.toLowerCase() === "settings.json");
            const points: File|undefined = files.find(fl => fl.name.toLowerCase() === "points.csv");
            // the three below are present for calculations in the Hamiltonian gauge only, besides all the other files
            const psiTilde: File|undefined = files.find(fl => fl.name.toLowerCase() === "psitilde.csv");
            const potential: File|undefined = files.find(fl => fl.name.toLowerCase() === "v_t.csv");
            const observablesQm: File|undefined = files.find(fl => fl.name.toLowerCase() === "observables.csv");
            const isQuantum: boolean = !!psi && !!observables;
            const isClassical: boolean = !!points;
            if ((!isQuantum && !isClassical) || !settings) {
                console.log("Files missing");
                return;
            }
            const id: string = (document.querySelector("#uploadDataset") as HTMLInputElement).value;
            if (!id) {
                console.log("Id not set");
                return;
            }
            this.#uploadRunning = true;
            try {
                const resultsQm = isQuantum ? await SimulationUtils.parseQmFiles(id, psi, observables, settings, psiTilde, observablesQm, potential) : undefined;
                const resultsClassical = isClassical ? await SimulationUtils.parseClassicalFiles(id, points, settings) : undefined;
                const results = isQuantum && isClassical ? {...resultsQm, classicalTrajectory: resultsClassical} : isQuantum ? resultsQm : resultsClassical;
                this.#simulationController.addResultSet(results);
                hideShowMenu(false);
            } catch(e) {
                //this.#activeResults = null;
                //this.#simulationController.addResultSet(null);
                console.log("Failed to upload results", e);
            } finally {
                this.#uploadRunning = false;
            }
            
        });
        fileSelector.dispatchEvent(new Event("change"));

        // for debugging
        (window as any).sch = (window as any).sch || {};
        Object.assign((window as any).sch, {
            results: () => this.#simulationController.getResultSets(),
            menu: () => hideShowMenu(),
            start: () => this.#simulationController.start(),
            pause: () => this.#simulationController.pause(),
            reset: (fraction?: number) => this.#simulationController.reset(fraction),
            advance: (frames: number) => this.#simulationController.advance(frames),
            getFrameIndices: () => this.#simulationController.getFrameIndices()
        });
    }

    run() {}
   
}

new Main().run();
