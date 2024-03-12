import { ColorRgba } from "./Color.js";
import { FileUpload } from "./FileImport.js";
import { SimulationControls } from "./SimulationControls.js";
import { ClassicalSettings, QmWidget, QuantumSettings, SimulationParameters, SimulationResult, SimulationResultClassical, SimulationResultQm, SimulationState, SimulationStateListener } from "./types.js";

/**
 * TODO adapt from old SimulationController
 * TODO support multiple uploads 
 * The glue code between the different widgets
 */
export class SimulationController {

    #currentResult: SimulationResult|undefined = undefined;

    // state
    

    readonly #listener = (event: CustomEvent<SimulationResult>) => {
        const result: SimulationResult = event.detail;
        const isClassical: boolean = !!(result as SimulationResultClassical).settingsClassical;
        const isQuantum: boolean = !!(result as SimulationResultQm).settingsQm;
        this.#currentResult = result;
        const widgets0 = this._widgets;
        const params0: QuantumSettings|ClassicalSettings = 
            (isClassical && isQuantum) ? {...(result as SimulationResultClassical).settingsClassical, ...(result as SimulationResultQm).settingsQm}
                : isQuantum ? (result as SimulationResultQm).settingsQm : (result as SimulationResultClassical).settingsClassical;
        // TODO color
        const params: SimulationParameters = {...params0, id: result.id, color: new ColorRgba([255,0,0,1]) };
        const widgets = Array.isArray(widgets0) ? widgets0 : widgets0();
        widgets.forEach(w => w.initialize([params]));
        this._ctrl.onProgress(0);
        this._ctrl.stateChanged(SimulationState.INITIALIZED);
    }

    constructor(
            private readonly _ctrl: SimulationControls,
            private readonly _fileUpload: FileUpload, 
            private readonly _widgets: Array<QmWidget>|(() => Array<QmWidget>)) {
        _fileUpload.addEventListener("upload", this.#listener);  // bind to this?
        const controlsListener = ((event: Event) => {
            const type = event.type;
            switch (type) {
            case "start":
                this._startSimulation();
                break;
            case "pause":
                this._pauseSimulation();
                break;
            case "stop":
                this._stopSimulation();
                break;
            case "reset":
                const fraction: number = (event as CustomEvent<{fraction: number}>).detail.fraction;
                this._resetSimulation(fraction);
                break;
            case "stepForward":
            case "stepBackward":
                const backward: boolean = type === "stepBackward";
                this._step(backward);
                break;
            default:
                // ?
            }
        }); 
        SimulationControls.EVENTS.forEach(event => _ctrl.addEventListener(event, controlsListener));

    }

    private _startSimulation() {
        if (!this.#currentResult)
            return;
        // TODO
    }

    private _pauseSimulation() {
        if (!this.#currentResult)
            return;
        // TODO
    }

    private _stopSimulation() {
        if (!this.#currentResult)
            return;
        // TODO
    }

    private _resetSimulation(fraction: number) {
        if (!this.#currentResult)
            return;
        // TODO
    }

    private _step(backward?: boolean) {
        if (!this.#currentResult)
            return;
        // TODO
    }

    currentResult(): SimulationResult|undefined {
        return this.#currentResult;
    }

    close() {
        this._fileUpload.removeEventListener("upload", this.#listener);
        SimulationControls.EVENTS.forEach(event => this._ctrl.removeEventListener(event, controlsListener));
    }


}

class SimulationRun {

    readonly #numQmStates: number;
    readonly #deltaT: number;
    readonly #hasTildePotentials: boolean;
    readonly #steps: number;

    //readonly #count: number;
    //#currentIdx: number;
    readonly #timeDuration: number;   // simulation time
    #passedTime: number;              // simulation time
    // first indices belong to quantum states, last ones to classical
    #indices: Array<number>|undefined;

    #timer: number;
    #startTime: number;               // "real" time
    #previousTime: number; 
    
    readonly #callback = (timestamp: number, frames?: number) => {
        if (this.#startTime === undefined) {
            this.#startTime = timestamp;
            /*
            if (this.#currentIdx !== undefined) {
                const fraction: number = this.#currentIdx / this.#count;
                if (fraction >= 1) // TODO?
                    return;
                const passedTime: number = fraction * this._durationMillis;
                this.#startTime = this.#startTime - passedTime;
            }*/
            if (this.#passedTime !== undefined && this.#indices !== undefined) {
                const fraction: number = this.#passedTime / this.#timeDuration;
                if (fraction >= 1) {// TODO?
                    this.pause();
                    return;
                }
                const passedTime: number = fraction * this._durationMillis;
                this.#startTime = this.#startTime - passedTime;
            }
        } else if (this.#previousTime === timestamp) {
            this.start(frames);
            return;
        } 
        this.#previousTime = timestamp;
        const passed: number = timestamp - this.#startTime;
        if (passed > this._durationMillis) {
            this.pause();
            //this.#currentIdx = undefined;
            this.#passedTime = undefined;
            this.#indices = undefined;
            this._stateListener.stateChanged(SimulationState.DONE);
            return
        }
        const fraction: number = passed / this._durationMillis;
        //const idx: number = Math.min(Math.floor(fraction * this.#count), this.#count - 1);
        const time: number = fraction * this.#timeDuration;
        const indices: Array<number> = this._getIndices(time);
        if (frames === 1 || !this.#indices || indices.findIndex((v, idx) => v !== this.#indices[idx]) >= 0) {
        /* if (idx !== this.#currentIdx || frames === 1) {
            this.#currentIdx = idx;
            const slice: Timeslice = this._result.waveFunction[idx];
            this._listener.next(slice);
            this._stateListener.onProgress(fraction);
            */
            this.#indices = indices;
            this.#passedTime = time;
            const slices: Array<[Timeslice, Timeslice|undefined]> = this._qmResults.map((r, idx) => [r.waveFunction[indices[idx]], r.waveFunctionTilde ? r.waveFunctionTilde[indices[idx]] : undefined]);
            const points: Array<Point> = this._classicalResults.map((r, idx) => r.points[indices[idx + this.#numQmStates]]);
            this._listener.next(slices, points, this.#hasTildePotentials ? this._qmResults.map((r, idx) => r.potential ? r.potential[indices[idx]] : undefined) : undefined);
            this._stateListener.onProgress(fraction);   
        }
        const newFrames: number|undefined = frames ? frames - 1 : undefined;
        if (!(newFrames <= 0)) 
            this.start(newFrames);
        else
            this.#startTime = undefined;
        // TODO else we need to reinitialized the start time somehow, resp. rememeber the fraction passed already
        // also applies to the pause function
    }


    constructor(
        private readonly _qmResults: Array<SimulationResultQm>,
        private readonly _classicalResults: Array<SimulationResultClassical>,
        private readonly _durationMillis: number,
        private readonly _listener: SimulationListener,
        private readonly _stateListener: SimulationStateListener
    ) {
        //this.#count = this._result.timesteps.length;
        const deltaTTimestamps: Array<[number, number]> = [..._qmResults, ..._classicalResults].map(r => [r.settings.deltaT || 1, Math.max(1, r.timesteps.length-1)]);
        this.#deltaT = Math.min(...deltaTTimestamps.map(arr => arr[0]));
        this.#steps = Math.max(...deltaTTimestamps.map(a => a[1]));
        //this.#count = Math.round(Math.max(..._results.map(r => r.settings.deltaT / deltaT * r.timesteps.length)));
        this.#timeDuration = Math.max(...deltaTTimestamps.map(arr => arr[0] * arr[1]));
        this.#numQmStates = _qmResults.length;
        this.#hasTildePotentials = this._qmResults.findIndex(r => r.potential) >= 0;
    }


    start(frames?: number) {
        window.cancelAnimationFrame(this.#timer); // avoid multiple concurrent runs
        this.#timer = window.requestAnimationFrame(timestamp => this.#callback(timestamp, frames));
    }

    // note: frames parameter may be positive or negative
    advance(frames?: number) {
        if (frames === 0)
            return;
        frames = frames || 1;
        const passedTime: number = this.#passedTime !== undefined ? this.#passedTime : 0;
        let newPassedTime: number = passedTime + frames * this.#deltaT;
        if (newPassedTime < 0)
            newPassedTime = 0;
        else if (newPassedTime > this.#timeDuration) {
            newPassedTime = this.#timeDuration;
            this.#startTime = undefined; // stop simulation if it is running
            this.#previousTime = undefined;
        }
        const actualDeltaFraction: number = (newPassedTime - passedTime) / this.#timeDuration;
        if (this.#startTime !== undefined) { // case already running
            const realTimeDelta: number = actualDeltaFraction * this._durationMillis;
            this.#startTime = this.#startTime - realTimeDelta;
        } else if (newPassedTime > 0) { // case not running
            this.#passedTime = newPassedTime;
            this.#indices = this._getIndices(this.#passedTime);
            this.start(1);
        }
    }

    pause() {
        window.cancelAnimationFrame(this.#timer);
        this.#startTime = undefined;
        this.#previousTime = undefined;
        // keep passedTime and indices!
    }

    reset(fraction?: number) {
        if (isFinite(fraction) && fraction >= 0 && fraction <= 1) {
            // must not set to max index, otherwise we might not get any further callbacks // XXX ?
            //this.#currentIdx = Math.min(Math.floor(fraction * this.#count), this.#count - 2);
            const time: number = fraction * this.#timeDuration;
            const indices: Array<number> = this._getIndices(time);
            this.#indices = indices;
            this.#passedTime = time;
            if (this.#startTime !== undefined) { // case: is running; just change the parameters
                this.#startTime = undefined;
                this.#previousTime = undefined;
            } else { // case: not running
                this.start(1);
            }
            return;
        }
        this.pause();
        this.#timer = undefined;
        this.#indices = undefined;
        this.#passedTime = undefined;
        this.start(1);
    }

    steps(): number {
        return this.#steps;
    }

    getFrameIndices(): {passedTime: number, frameIndices: Record<string, number>} {
        return {
            passedTime: this.#passedTime,
            frameIndices: this.#indices !== undefined ? 
                Object.fromEntries([...this._qmResults, ...this._classicalResults].map((run, idx) => [
                    run.id, this.#indices[idx]
                ])) : undefined
        };
    }

    private _getIndices(time: number): Array<number> {
        return [...this._qmResults, ...this._classicalResults].map(r => {
            const larger: number = r.timesteps.findIndex(step => step > time);
            const previous: number = larger > 0 ? larger-1 : larger === 0 ? larger : r.timesteps.length-1;
            return previous;
        });
    }

}

