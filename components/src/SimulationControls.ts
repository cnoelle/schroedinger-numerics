import { JsUtils } from "./JsUtils.js";
import { SimulationDurationChange, SimulationState, SimulationStateChange, SimulationStateListener, SimulationStateReset } from "./types.js";

/**
 * <div class="controls">
        <div id="simPlay">
            <img src="assets/icons/play_arrow_black_24dp.svg" class="control-icon" title="Play">
        </div>
        <div id="simStop">
            <img src="assets/icons/stop_black_24dp.svg" class="control-icon control-icon-disabled" title="Stop">
        </div>
        <div id="simProgress">
            <progress min="0" max="100" value="0" class="control-icon control-icon-disabled"> 0% </progress>
        </div>
        <div class="aligned-row left-margin">
            <div>Seconds: </div>
            <input type="number" min="1" step="1" value="10" id="simDuration" class="sim-duration-control"
                placeholder="Simulation duration" 
                title="Seconds the complete simulation takes to run">
        </div>
    </div>
 */
export class SimulationControls extends HTMLElement implements SimulationStateListener {

    public static readonly EVENTS: ReadonlyArray<string> 
            = Object.freeze(["start", "stop", "pause", "reset", "stepBackward", "stepForward" ]);
    private static DEFAULT_TAG: string = "simulation-controls";
    private static _tag: string|undefined;

    static get observedAttributes() {
        return ["duration"]; 
    }

    /**
     * Call once to register the new tag type "<phase-space-density></phase-space-density>"
     * @param tag 
     */
    static register(tag?: string) {
        tag = tag || SimulationControls.DEFAULT_TAG;
        if (tag !== SimulationControls._tag) {
            customElements.define(tag, SimulationControls);
            SimulationControls._tag = tag;
        }
    }

    /**
     * Retrieve the registered tag type for this element type, or undefined if not registered yet.
     */
    static tag(): string|undefined {
        return SimulationControls._tag;
    }

    private static readonly _PLAY_SOURCE: string = "assets/icons/play_arrow_black_24dp.svg";
    private static readonly _STOP_SOURCE: string = "assets/icons/stop_black_24dp.svg";
    private static readonly _PAUSE_SOURCE: string = "assets/icons/pause_black_24dp.svg";
    private static readonly _CLASS_DISABLED: string = "control-icon-disabled";

    readonly #play: HTMLImageElement;
    readonly #stop: HTMLImageElement;
    readonly #progress: HTMLProgressElement;
    readonly #duration: HTMLInputElement;
    readonly #titles: Map<HTMLElement, string>;

    #state: SimulationState = SimulationState.UNSET;
    /**
     * Duration in seconds
     */
    #simDuration: number = 10;

    constructor() {
        super();
        // id required?
        const flex = JsUtils.createElement("div", {classes: ["controls"]});
        this.#play = JsUtils.createElement("img", {classes: ["control-icon"], title: "Play", 
                parent: JsUtils.createElement("div", {parent: flex}),
                attributes: new Map([["src", SimulationControls._PLAY_SOURCE]])});
        this.#stop = JsUtils.createElement("img", {classes: ["control-icon", "control-icon-disabled"], title: "Stop", 
                parent: JsUtils.createElement("div", {parent: flex}),
                attributes: new Map([["src", SimulationControls._STOP_SOURCE]])});
        this.#progress = JsUtils.createElement("progress", {classes: ["control-icon"], text: "0%", 
                parent: JsUtils.createElement("div", {parent: flex}),
                attributes: new Map([["min", "0"], ["max", "100"], ["value", "0"]])});
        const durationParent = JsUtils.createElement("div", {classes: ["aligned-row left-margin"], 
                parent: JsUtils.createElement("div", {parent: flex}),});
        JsUtils.createElement("div", {parent: durationParent, text: "Seconds: "});    
        this.#duration = JsUtils.createElement("input", {classes: ["sim-duration-control"], parent: durationParent,
                title: "Seconds the complete simulation takes to run", 
                attributes: new Map([["type", "number"], ["min", "1"], ["step", "1"], ["value", "10"], ["placeholder", "Simulation duration"]])});
        
        const style: HTMLStyleElement = document.createElement("style");
        //style.textContent = ":host { position: relative; display: block; }";
        style.textContent = ".controls {   display: flex; column-gap: 0.5em; }" +
            " .aligned-row { display: flex; column-gap: 0.5em; align-items: baseline; flex-wrap: nowrap; }" + 
            " .left-margin { margin-left: 1em; }" + 
            " .control-icon { cursor: pointer; } .control-icon-disabled { opacity: 0.5; } " +
            " .control-icon-disabled:hover { cursor: auto; }" +            
            " .sim-duration-control { max-width: 8em; }";
        this.shadowRoot.appendChild(style); // TODO do we first need to attach a new shadow root?
        // const shadow: ShadowRoot = this.attachShadow({mode: "open"});    
        this.shadowRoot.appendChild(flex);  

        this.#titles = new Map([
           [this.#play as HTMLElement, "Run simulation"],
           [this.#stop as HTMLElement, "Stop simulation"],
           [this.#progress as HTMLElement, "Jump to position"]
        ]);
        // TODO need to fire an event
        this.#duration.addEventListener("change", event => {
            const durationSeconds: number = (event.currentTarget as HTMLInputElement).valueAsNumber;
            if (!(durationSeconds > 0))
                return;
            this.duration = durationSeconds;
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
                this._fire("reset", {fraction: fraction});
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
                this._fire("start");
                break;
            case SimulationState.RUNNING:
                this._fire("pause");
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
                this._fire("stop");
                //controller.reset();
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
            //const frames: number = controller.steps() > 1000 ? 10 : 1;
            switch (this.#state) {
            case SimulationState.UNSET:
                return;
            default:
                this._fire(leftOrRight ? "stepBackward" : "stepForward");
            }
        });
    }

    /**
     * Duration in s.
     */
    set duration(duration: number) {
        if (!Number.isFinite(duration))
            throw new Error("Invalid duration " + duration);
        this.#simDuration = duration;
        this.dispatchEvent(new CustomEvent<SimulationDurationChange>("durationChange", {detail: {seconds: duration}}));
    }

    get duration(): number {
        return this.#simDuration;
    }

    private _fire(event: SimulationStateChange, detail?: SimulationStateReset) {
        if (detail)
            this.dispatchEvent(new CustomEvent<SimulationStateReset>(event, {detail: detail}));
        else
            this.dispatchEvent(new Event(event));
    }

    stateChanged(simulationState: SimulationState): void {
        this.#state = simulationState;
        switch(simulationState) {
        case SimulationState.INITIALIZED: // fallthrough
        case SimulationState.PAUSED:
        case SimulationState.DONE:
            this.#play.src = SimulationControls._PLAY_SOURCE;
            this._enable(this.#play);
            this._enable(this.#progress);
            if (simulationState === SimulationState.PAUSED || simulationState == SimulationState.DONE)
                this._enable(this.#stop);
            else
                this._disable(this.#stop);
            break;
        case SimulationState.RUNNING:
            this.#play.src = SimulationControls._PAUSE_SOURCE;
            this._enable(this.#play, "Pause simulation");
            this._enable(this.#stop);
            this._enable(this.#progress);
            break;
        case SimulationState.UNSET:
            this.#play.src = SimulationControls._PLAY_SOURCE;
            this._disable(this.#play);
            this._disable(this.#stop);
            this._disable(this.#progress);
            break;
        default:
            console.log("Unexpected simulation state", simulationState);
        }
    }

    state(): SimulationState {
        return this.#state;
    }

    onProgress(fraction: number): void {
        this.#progress.value = fraction * 100;
    }

    private _enable(element: HTMLElement, title?: string) {
        if (title === undefined)
            title = this.#titles.get(element) || ""; 
        element.classList.remove(SimulationControls._CLASS_DISABLED);
        element.title = title;
    }

    private _disable(element: HTMLElement) {
        element.classList.add(SimulationControls._CLASS_DISABLED);
        element.title = "";
    }

    attributeChangedCallback(name: string, oldValue: string|null, newValue: string|null) {
        const attr: string = name.toLowerCase();
        switch (attr) {
        case "duration":
            this.duration = parseFloat(newValue);
            break;
        default:
            
        }
    }
    

}
