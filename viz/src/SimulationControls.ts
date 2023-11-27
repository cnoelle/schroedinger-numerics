import { SimulationController } from "./SimulationController";
import { SimulationState, SimulationStateListener } from "./types";

export class SimulationControls implements SimulationStateListener {

    private static readonly PLAY_SOURCE: string = "assets/icons/play_arrow_black_24dp.svg";
    private static readonly PAUSE_SOURCE: string = "assets/icons/pause_black_24dp.svg";
    private static readonly CLASS_DISABLED: string = "control-icon-disabled";

    readonly #play: HTMLImageElement;
    readonly #stop: HTMLImageElement;
    readonly #progress: HTMLProgressElement;
    readonly #duration: HTMLInputElement;
    readonly #titles: Map<HTMLElement, string>;

    #state: SimulationState = SimulationState.UNSET;

    constructor(controller: SimulationController) {
        this.#play = document.querySelector("#simPlay>img");
        this.#stop = document.querySelector("#simStop>img");
        this.#progress = document.querySelector("#simProgress>progress");
        this.#duration = document.querySelector("#simDuration");
        this.#titles = new Map([
           [this.#play as HTMLElement, "Run simulation"],
           [this.#stop as HTMLElement, "Stop simulation"],
           [this.#progress as HTMLElement, "Jump to position"]
        ]);
        this.#duration.valueAsNumber = Math.max(1, Math.round(controller.getDuration()/1000));
        this.#duration.addEventListener("change", event => {
            const durationSeconds: number = (event.currentTarget as HTMLInputElement).valueAsNumber;
            if (!durationSeconds)
                return;
            controller.setDuration(durationSeconds * 1000);
        });
        this.#progress.addEventListener("click", event => {
            switch (this.#state) {
            case SimulationState.UNSET:
                return;
            case SimulationState.INITIALIZED:
            case SimulationState.PAUSED:
            case SimulationState.DONE:
            case SimulationState.RUNNING:
                const el: HTMLElement = event.currentTarget as HTMLElement;
                const fraction: number = (event.clientX - el.offsetLeft) / el.clientWidth; // TODO validate
                controller.reset(fraction);
            break;
            }
        });
        this.#play.addEventListener("click", () => {
            switch (this.#state) {
            case SimulationState.UNSET:
                return;
            case SimulationState.INITIALIZED:
            case SimulationState.PAUSED:
            case SimulationState.DONE:
                controller.start();
                break;
            case SimulationState.RUNNING:
                controller.pause();
            break;
            }
        });
        this.#stop.addEventListener("click", () => {
            switch (this.#state) {
            case SimulationState.UNSET:
                return;
            case SimulationState.INITIALIZED:
            case SimulationState.PAUSED:
            case SimulationState.RUNNING:
            case SimulationState.DONE:
                controller.reset();
            break;
            }
        });
        document.addEventListener("keydown", event => {
            let leftOrRight: boolean;
            switch (event.key) {
            case "ArrowRight":
                leftOrRight = false;
                break;
            case "ArrowLeft":
                leftOrRight = true;
                break;
            default:
                return;
            }
            event.preventDefault();
            const frames: number = controller.steps() > 1000 ? 10 : 1;
            switch (this.#state) {
            case SimulationState.UNSET:
                return;
            default:
                controller.advance(leftOrRight ? -frames : frames);
            }
        });
    }

    stateChanged(simulationState: SimulationState): void {
        this.#state = simulationState;
        switch(simulationState) {
        case SimulationState.INITIALIZED: // fallthrough
        case SimulationState.PAUSED:
        case SimulationState.DONE:
            this.#play.src = SimulationControls.PLAY_SOURCE;
            this._enable(this.#play);
            this._enable(this.#progress);
            if (simulationState === SimulationState.PAUSED || simulationState == SimulationState.DONE)
                this._enable(this.#stop);
            else
                this._disable(this.#stop);
            break;
        case SimulationState.RUNNING:
            this.#play.src = SimulationControls.PAUSE_SOURCE;
            this._enable(this.#play, "Pause simulation");
            this._enable(this.#stop);
            this._enable(this.#progress);
            break;
        case SimulationState.UNSET:
            this.#play.src = SimulationControls.PLAY_SOURCE;
            this._disable(this.#play);
            this._disable(this.#stop);
            this._disable(this.#progress);
            break;
        default:
            console.log("Unexpected simulation state", simulationState);
        }
    }

    onProgress(fraction: number): void {
        this.#progress.value = fraction * 100;
    }

    private _enable(element: HTMLElement, title?: string) {
        if (title === undefined)
            title = this.#titles.get(element) || ""; 
        element.classList.remove(SimulationControls.CLASS_DISABLED);
        element.title = title;
    }

    private _disable(element: HTMLElement) {
        element.classList.add(SimulationControls.CLASS_DISABLED);
        element.title = "";
    }
    

}
