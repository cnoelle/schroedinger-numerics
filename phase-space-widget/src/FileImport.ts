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

export interface TimestepWaveFunction {
    /**
     * The absolute values of the wave function in position representation
     */
    valuesX: Array<number>; 
    /**
     * The absolute values of the wave function in momentum representation
     */
    valuesP: Array<number>;
}

/**
 * Wave function in position and momentum representation per timestep
 */
export interface WaveFunctionResultFiles {

    x: Dimension;
    p: Dimension;
    numTimesteps: number;
    timesteps: Iterator<TimestepWaveFunction>;

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

    static readPhaseSpace(file: File): Promise<PhaseSpaceResultFile> {
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

    static async readWaveFunction(files: Array<File>): Promise<WaveFunctionResultFiles> {
        if (!(files?.length > 1))
            return undefined;
        const psiXFile = files.find(f => f.name === "psi.csv");
        const psiPFile = files.find(f => f.name === "psiP.csv");
        if (!psiXFile || !psiPFile)
            return undefined;
        const psiXPromise: Promise<WaveFunctionCsvParser> = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const csv: string = event.target.result as string;
                try {
                    resolve(new WaveFunctionCsvParser(csv));
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
            reader.readAsText(psiXFile, "UTF-8");
        });
        const psiPPromise: Promise<WaveFunctionCsvParser> = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const csv: string = event.target.result as string;
                try {
                    resolve(new WaveFunctionCsvParser(csv));
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
            reader.readAsText(psiPFile, "UTF-8");
        });
        const [xParser, pParser]: [WaveFunctionCsvParser, WaveFunctionCsvParser] = await Promise.all([psiXPromise, psiPPromise]);
        const xDim = xParser.dimension();
        const pDim = pParser.dimension();
        const numTimesteps = Math.min(xParser.numTimesteps(), pParser.numTimesteps());
        return {
            x: xDim,
            p: pDim,
            numTimesteps: numTimesteps,
            timesteps: new WaveFunctionIterator(numTimesteps, xParser, pParser)
        }
    }

    static setupAnimationWf(result: WaveFunctionResultFiles, phaseSpace: PhaseSpaceWidget): AnimationControl {
        const width = phaseSpace.width - phaseSpace.boundary;
        const height = phaseSpace.height - phaseSpace.boundary;
        const xDim = result.x;
        const xSteps = xDim.steps;
        const xStepSize = xDim.stepSize;
        const xLower = xDim.lower;
        const pDim = result.p;
        const pSteps = pDim.steps;
        const pStepSize = pDim.stepSize;
        const pLower = pDim.lower;
        const timesteps = result.timesteps;
        const numTimesteps = result.numTimesteps;
        const xRange: [number, number] = [xLower, xLower + xSteps * xStepSize];
        const pRange: [number, number] = [pLower, pLower + pSteps * pStepSize];
        const values = new Uint8ClampedArray(width * height);
        const density = new Density(values, width, {maxValue: 255, xRange: xRange, pRange: pRange,
            cellsX: xSteps, cellsP: pSteps});
        const controller: AnimationControlImpl = new AnimationControlImpl();
        phaseSpace.values = density;
        let start: number|undefined = undefined;
        let frameCnt: number = -1;
        let timestep: TimestepWaveFunction|undefined;
        function step(t: number|undefined) {
            if (start === undefined)
                start = t;
            const secondsElapsed = t !== undefined ? (t - start)/1000 : 0;
            const fraction = (secondsElapsed % 10)/10;
            const frame = Math.floor(fraction * numTimesteps);
            if (frame < numTimesteps) {
                while (frameCnt < frame || timestep === undefined) {
                    const next = timesteps.next();
                    if (next.done)
                        break;
                    timestep = next.value;
                    frameCnt++;
                }
            }
            const arr = [0];
            const maxValue = Math.max(...timestep.valuesP) * Math.max(...timestep.valuesX);
            for (let p=0; p<height; p++) {
                const rowStart = p * width;
                const pValueIdx = Math.min(Math.floor(p/height * pSteps), pSteps-1);
                const pValue: number = timestep.valuesP[pValueIdx];
                for (let x=0; x<width; x++) {
                    const xValueIdx = Math.min(Math.floor(x/width * xSteps), xSteps-1);
                    const xValue: number = timestep.valuesX[xValueIdx];
                    const value = Math.floor(xValue * pValue / maxValue * 256);
                    // FIXME
                    //console.log("Value", value, xValue, pValue, maxValue)
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

class WaveFunctionCsvParser implements Iterator<Array<Number>> {

    readonly #numTimesteps: number;
    readonly #firstLineBreak: number;
    readonly #dim: Dimension;

    // state
    #cursor: number;
    #done: boolean = false;

    constructor(private readonly csv: string) {
        this.#numTimesteps = csv.length - csv.replaceAll("\n", "").length - 1;
        this.#firstLineBreak = csv.indexOf("\n");
        this.#dim = WaveFunctionCsvParser._parseHeader(csv, this.#firstLineBreak);
        this.#cursor = this.#firstLineBreak;
    }

    numTimesteps(): number {
        return this.#numTimesteps;
    }

    dimension(): Dimension {
        return this.#dim;
    }

    next(): IteratorResult<Number[], any> {
        if (this.#done)
            return {done: true, value: undefined};
        let nextBreak = this.csv.indexOf("\n", this.#cursor+1);
        if (nextBreak < 0) {
            const elements = this.csv.substring(this.#cursor).split(",");
            this.#done = true;
            if (elements.length < this.#dim.steps + 1)
                return {done: true, value: undefined}
            nextBreak = this.csv.length;
        }
        const line = this.csv.substring(this.#cursor+1, nextBreak);
        this.#cursor = nextBreak;
        const elements = line.split(",");
        if (elements.length !== this.#dim.steps + 1) {
            if (elements.length === 1) // empty
                return this.next();
            throw new Error("Invalid line with unexpected number of entries. Expected: " + (this.#dim.stepSize + 1) 
                + ", got " + elements.length);
        }
        return {done: false, value: elements.map(e => WaveFunctionCsvParser._parseComplexNumberAbsSquare(e))};
    }

    // always expecting a number in the format a + bi
    private static _parseComplexNumberAbsSquare(n: string): number {
        let isPlus: boolean = true;
        let splitIdx: number = n.indexOf(" + ");
        if (splitIdx < 0) {
            splitIdx = n.lastIndexOf(" - ");
            if (splitIdx >= 0)
                isPlus = false;
        }
        const a = Number.parseFloat(n.substring(0, splitIdx));
        const b = Number.parseFloat(n.substring(splitIdx + 3, n.lastIndexOf("i")));
        return a*a + b*b;
    }

    private static _parseHeader(csv: string, firstLineBreak: number): Dimension {
        const firstLine = csv.substring(0, firstLineBreak);
        const header = firstLine.split(",");
        const l = header.length;
        const lower = WaveFunctionCsvParser._parseHeaderCell(header[0]);
        const upper = WaveFunctionCsvParser._parseHeaderCell(header[l-1]);
        const stepSize = (upper - lower) / (l - 1);
        return {
            lower: lower,
            steps: l - 1,
            stepSize: stepSize
        }
    }

    private static _parseHeaderCell(cell: string): number {
        cell = cell.trim();
        if (!cell.toLowerCase().startsWith("psi(") || !cell.endsWith(")"))
            throw new Error("Invalid header cell " + cell);
        const val = Number.parseFloat(cell.substring(4, cell.length-1));
        if (!Number.isFinite(val))
            throw new Error("Invalid header cell " + cell);
        return val;
    }

}

class WaveFunctionIterator implements Iterator<TimestepWaveFunction> {

    // state
    #count: number = 0;

    constructor(private readonly _numTimesteps: number, 
        private readonly _x: WaveFunctionCsvParser,
        private readonly _p: WaveFunctionCsvParser) {}

    next(): IteratorResult<TimestepWaveFunction, any> {
        if (this.#count >= this._numTimesteps)
            return {done: true, value: undefined};
        const x = this._x.next();
        const p = this._p.next();
        this.#count += 1;
        return {done: false, value: {valuesX: x.value, valuesP: p.value}};
    }

}


