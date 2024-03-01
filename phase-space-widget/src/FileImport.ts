import { Density, PhaseSpaceWidget } from "./PhaseSpaceWidget.js";

export interface Dimension {
    lower: number;
    stepSize: number;
    steps: number;
}

export interface Timestep {
    t: number;
    /**
     * Non-null values range, index based
     */
    xRange: [number, number]|undefined;
    /**
     * Non-null values range, index based
     */
    pRange: [number, number]|undefined;
    /**
     * Dimension: (xRange[1]-xRange[0]) * (pRange[1]-pRange[0]) (roughly).
     * Values range: 0-255
     * access: data[x][p]
     */
    data: Array<Array<number>>;
}

export interface PhaseSpaceResultFile {

    grid: {x: Dimension; p: Dimension};
    timesteps: [Timestep];

}

export interface AnimationListener {
    started: () => void; 
    stopped: () => void; 
    init?: () => void;
}

export interface AnimationControl {
    init(): void;
    run(): void;
    stop(): void;
    isRunning(): boolean;
    addListener(listener: AnimationListener): void;
}

class AnimationControlImpl implements AnimationControl {

    #stopped: boolean = false;
    readonly #listeners: Array<AnimationListener> = [];

    constructor() {}

    init() {
        this.#listeners.filter(l => !!l.init).forEach(l => l.init());
    }

    run(): void {
        this.#stopped = false;
        this.#listeners.forEach(l => l.started());
    }

    stop(): void {
        this.#stopped = true;
        window.requestAnimationFrame(() => this.#listeners.forEach(l => l.stopped()));
    }

    isRunning(): boolean {
        return !this.#stopped;
    }

    addListener(listener: AnimationListener): void {
        this.#listeners.push(listener);
    }

}

export class FileImport {

    static read(file: File): Promise<PhaseSpaceResultFile> {
        if (!file)
            return Promise.resolve(undefined);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                try {
                    const result: PhaseSpaceResultFile = JSON.parse(event.target.result as string);
                    if (!result.grid || !result.timesteps || !Array.isArray(result.timesteps))
                        reject(new Error("Invalid file format"));
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = reject;
            /*
            reader.onprogress = (event: ProgressEvent<FileReader>) => {
                if (event.lengthComputable) 
                    task.progress(event.loaded, event.total);
            };
            */
            reader.readAsText(file, "UTF-8");
        });
    }

    static setupAnimation(result: PhaseSpaceResultFile, phaseSpace: PhaseSpaceWidget): AnimationControl {
        const width = phaseSpace.width - phaseSpace.boundary;
        const height = phaseSpace.height - phaseSpace.boundary;
        const xDim = result.grid.x;
        const xSteps = xDim.steps;
        const xStepSize = xDim.stepSize;
        const xLower = xDim.lower;
        const pDim = result.grid.p;
        const pSteps = pDim.steps;
        const pStepSize = pDim.stepSize;
        const pLower = pDim.lower;
        const timesteps = result.timesteps;
        const numTimesteps = timesteps.length;
        const xRange: [number, number] = [xLower, xLower + xSteps * xStepSize];
        const pRange: [number, number] = [pLower, pLower + pSteps * pStepSize];
        const values = new Uint8ClampedArray(width * height);
        const density = new Density(values, width, {maxValue: 255, xRange: xRange, pRange: pRange,
            cellsX: xSteps, cellsP: pSteps});
        const controller: AnimationControlImpl = new AnimationControlImpl();
        phaseSpace.values = density;
        let start: number|undefined = undefined;
        function step(t: number|undefined) {
            if (start === undefined)
                start = t;
            const secondsElapsed = t !== undefined ? (t - start)/1000 : 0;
            const fraction = (secondsElapsed % 10)/10;
            const frame = Math.floor(fraction * numTimesteps);
            const timestep = timesteps[frame];
            const arr = [0];
            for (let p=0; p<height; p++) {
                const rowStart = p * width;
                const pValueIdx = Math.min(Math.floor(p/height * pSteps), pSteps-1);
                let knownZeroP = false;
                if (timestep.pRange && (pValueIdx < timestep.pRange[0] || pValueIdx >= timestep.pRange[1]))
                    knownZeroP = true;
                for (let x=0; x<width; x++) {
                    const xValueIdx = Math.min(Math.floor(x/width * xSteps), xSteps-1);
                    let knownZero = knownZeroP;
                    if (!knownZero && timestep.xRange && (xValueIdx < timestep.xRange[0] || xValueIdx >= timestep.xRange[1]))
                        knownZero = true;
                    if (knownZero) {
                        arr[0] = 0
                        values.set(arr, rowStart + x);
                        continue;
                    }
                    const pIdx = timestep.pRange ? pValueIdx - timestep.pRange[0] : pValueIdx;
                    const xIdx = timestep.xRange ? xValueIdx - timestep.xRange[0] : xValueIdx;
                    const value = timestep.data[xIdx][pIdx];
                    arr[0] = value;
                    values.set(arr, rowStart + x);
                }    
            }
            phaseSpace.draw();
            if (t !== undefined && controller.isRunning())
                window.requestAnimationFrame(step);
        }
        controller.addListener({
            started: () => window.requestAnimationFrame(step), 
            stopped: () => start = undefined,
            init: () => step(undefined)
        });
        return controller;
    }

}