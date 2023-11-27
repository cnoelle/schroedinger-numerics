import { DatasetsGrid } from "./datasetsGrid.js";
import { JsUtils } from "./JsUtils.js";
import { SimulationListener, QuantumSimulationResult, SimulationState, SimulationStateListener, Timeslice, ClassicalSimulationResult, Point } from "./types.js";

export class SimulationController {

    #qmResultSet: Array<QuantumSimulationResult> = [];
    #classicalResultSet: Array<ClassicalSimulationResult> = [];

    #activeSimulation: SimulationRun|null = null;
    #duration: number = 10_000;
    #scales: Array<number> = [];

    #state: SimulationState = SimulationState.UNSET;

    readonly #datasetsViz: DatasetsGrid;

    readonly #listener: SimulationListener&any = { 

        _errorsReported: {},

        initialize: (qm: Array<QuantumSimulationResult>, classical: Array<ClassicalSimulationResult>) => {
            this.#listener._errorsReported = {};
            this.listeners.forEach((l, idx) => {
                try {
                    l.initialize(qm, classical);
                } catch (e) {
                    console.log("Failed to initialize listener ", l, e);
                    this.#listener._errorsReported[idx] = e;
                }
            })
        },
        scale: (scale: number) => this.listeners.forEach(l => l.scale(scale)),
        next: (slice: Array<[Timeslice, Timeslice|undefined]>, points: Array<Point>, potential?: Array<Array<number>>) => 
                this.listeners.forEach((l, idx) => {
                    try {
                        l.next(slice, points, potential);
                    } catch (e) {
                        if (!(idx in this.#listener._errorsReported)) {
                            console.log("Error in listener ", l, e);
                            this.#listener._errorsReported[idx] = e;
                        }
                    }
                }),
        clear: () => {
            this.listeners.forEach(l => l.clear());
            this.#listener._errorsReported = {};
        }
    };

    readonly #stateListener: SimulationStateListener

    constructor(
        private readonly listeners: Array<SimulationListener>,
        // TODO report done state?
        private readonly stateListeners: Array<SimulationStateListener>
    ) {
        this.#datasetsViz = new DatasetsGrid();
        const obj = this;
        this.#stateListener = {
            stateChanged(simulationState: SimulationState): void {
                obj._setState(simulationState);
            },
            onProgress(fraction: number): void {
                obj.stateListeners.forEach((l: SimulationStateListener) => l.onProgress ? l.onProgress(fraction) : {})
            }
        }
    }
    
    addResultSet(results: QuantumSimulationResult|ClassicalSimulationResult) {
        const id: string = results.id;
        const isClassical: boolean = (results as ClassicalSimulationResult).points !== undefined;
        const targetArray: Array<any> = isClassical ? this.#classicalResultSet : this.#qmResultSet;
        if (targetArray.find(r => r.id === id))
            throw new Error("Result set " + id + " already exists");
        targetArray.push(results);
        this.#listener.initialize(this.#qmResultSet, this.#classicalResultSet);
        if (!isClassical) {
            const scale0: number = Math.max(...(results as QuantumSimulationResult).waveFunction.map(arr => 
                    Math.max(...arr.waveFunction.map(values => values[0]*values[0] + values[1]*values[1]))));
            const scale: number = Math.sqrt(scale0);
            this.#scales.push(scale)
            if (Math.max(...this.#scales) <= scale)
                this.#listener.scale(scale);
        }
        this._restart();
        this.#datasetsViz.addResultDataset(results);
    }

    removeResultSet(id: string): boolean {
        const idx: number = this.#qmResultSet.findIndex(r => r.id === id);
        if (idx < 0)
            return false;
        this.#qmResultSet.splice(idx, 1);
        this.#scales.splice(idx, 1);
        this.#datasetsViz.removeResultDataset(id);
        return true;
    }

    getResultSets(): Array<QuantumSimulationResult|ClassicalSimulationResult> {
        return [...this.#qmResultSet, ...this.#classicalResultSet];
    }

    getDuration(): number {
        return this.#duration;
    }

    setDuration(millis: number) {
        if (!(millis > 0))
            return;
        this.#duration = millis;
        this._restart();
    }

    start() {
        if (this.#activeSimulation) {
            this.#activeSimulation.start();
            this._setState(SimulationState.RUNNING);
        }
    }

    pause() {
        if (this.#activeSimulation) {
            this.#activeSimulation.pause();
            this._setState(SimulationState.PAUSED);
        }
    }

    reset(fraction?: number) {
        if (this.#activeSimulation) {
            this.#activeSimulation.reset(fraction);
            // FIXME only if fraction is not set
            if (fraction === undefined)
                this._setState(SimulationState.INITIALIZED);
        }
    }

    steps(): number {
        return this.#activeSimulation?.steps() || 0;
    }

    advance(frames: number) {
        this.#activeSimulation?.advance(frames);
    }

    getFrameIndices(): {passedTime: number, frameIndices: Record<string, number>}|undefined {
        return this.#activeSimulation?.getFrameIndices();
    }

    private _setState(state: SimulationState) {
        if (state !== this.#state) {
            this.#state = state;
            this.stateListeners.forEach(l => l.stateChanged(state));
        }
    }

    private _restart() {
        this.#activeSimulation?.pause();
        if (this.#qmResultSet.length === 0 && this.#classicalResultSet.length === 0) {
            this._setState(SimulationState.UNSET);
            return;
        }
        this.#activeSimulation = new SimulationRun(this.#qmResultSet, this.#classicalResultSet, this.#duration, this.#listener, this.#stateListener);
        this.#activeSimulation.start(1);
        this._setState(SimulationState.INITIALIZED);
    }

}

// TODO report new fraction to stateListeners
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
        private readonly _qmResults: Array<QuantumSimulationResult>,
        private readonly _classicalResults: Array<ClassicalSimulationResult>,
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