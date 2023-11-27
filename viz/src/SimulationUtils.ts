import { ClassicalSettings, ClassicalSimulationResult, ExpectationValues, Point, QuantumSettings, QuantumSimulationResult, Timeslice } from "./types.js";

export class SimulationUtils {

    private static nextRow(str: string, start: number, minExpectedEntries?: number): [Array<string>, number]|null {
        minExpectedEntries = minExpectedEntries||1;
        const l: number = str.length;
        if (start >= l)
            return null;
        const nextLineBreak: number = str.indexOf("\n", start);
        if (nextLineBreak < 0) {
            const arr: Array<string> = str.substring(start).split(",");
            if (arr.length < minExpectedEntries || arr.length === 1 && arr[0].trim() === "")
                return null;
            return [arr.map(e => e.trim()), l];
        } else if (nextLineBreak === start) {
            return SimulationUtils.nextRow(str, start + 1, minExpectedEntries);
        }
        const arr: Array<string> = str.substring(start, nextLineBreak).split(",").map(e => e.trim());
        if (arr.length < minExpectedEntries)
            return SimulationUtils.nextRow(str, nextLineBreak + 1, minExpectedEntries)
        return [arr, nextLineBreak+1];
    }

    // TODO progress bar
    static async parseClassicalFiles(id: string, points: File, settings: File): Promise<ClassicalSimulationResult> {
        const pointsPromise: Promise<Array<Point>> = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const result: string = event.target.result as string;
                const header: [Array<string>, number]|null = SimulationUtils.nextRow(result, 0, 2);
                if (!header) {
                    reject(new Error("Wave function file does not contain any data"));
                    return;
                }
                const x: number = header[0].indexOf("x");
                const p: number = header[0].indexOf("p");
                const E: number = header[0].indexOf("E");
                if (x < 0 || p<0 ) {
                    reject(new Error("Points file does not provide all required observables; header: " + JSON.stringify(header[1])));
                    return;
                }
                const points0: Array<Point> = [];
                let start: number = header[1];
                while (true) {
                    const line0: [Array<string>, number]|null = SimulationUtils.nextRow(result, start, 2);
                    if (!line0)
                        break;
                    start = line0[1];
                    const line: Array<string> = line0[0];
                    const point: Point = {
                        x: parseFloat(line[x]),
                        p: parseFloat(line[p])
                    }
                    if (E >= 0)
                        point.E = parseFloat(line[E]);
                    points0.push(point);
                }
                resolve(points0);
            };
            reader.onerror = reject;
            reader.readAsText(points, "UTF-8");
        });
        const settingsPromise: Promise<ClassicalSettings> = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const result: string = event.target.result as string;
                try {
                    resolve(JSON.parse(result));
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = reject;
            reader.readAsText(settings, "UTF-8");
        });
        const result = await Promise.all([pointsPromise, settingsPromise]);
        const pointsResult: Array<Point> = result[0];
        const settings2: ClassicalSettings = result[1];
        return {
            id: id,
            points: pointsResult,
            settings: settings2,
            timesteps: pointsResult.map((_, idx) => idx * settings2.deltaT),
        };
    }

    private static _parseWaveFunctionFile(file: File, progressReporter: ProgressReporter, options?: {headerPrefix?: string}): Promise<[Array<number>, Array<Array<[number, number]>>]|undefined> {
        if (!file)
            return Promise.resolve(undefined);
        const headerPrefix: string = (options?.headerPrefix || "Psi") + "(";
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const result: string = event.target.result as string;
                // expect entries of the form Psi(x0), Psi(x1), ..., Psi(xk)
                const header: [Array<string>, number]|null = SimulationUtils.nextRow(result, 0, 2);
                if (!header) {
                    reject(new Error("Wave function file does not contain any data"));
                    return;
                }
                const xs: Array<number> = header[0]
                    .filter(head => head.startsWith(headerPrefix))
                    .map(head => parseFloat(head.substring(headerPrefix.length, head.length-1)));
                if (xs.findIndex(x => !isFinite(x)) >= 0) {
                    reject(new Error("Invalid x value " + xs.find(x => !isFinite(x))));
                    return;
                }
                const unsorted: number|undefined = xs.find((x, idx) => idx > 0 && x <= xs[idx-1]);
                if (unsorted !== undefined)  {
                    reject(new Error(headerPrefix +  " not sorted"));
                    return;
                }
                const psindices: Array<number> = header[0]
                    .map((head, idx) => [idx, head.startsWith(headerPrefix)])
                    .filter(arr => arr[1])
                    .map(arr => arr[0] as number)
                const maxIdx: number = Math.max(...psindices);
                let start: number = header[1];
                const psi: Array<Array<[number, number]>> = []; // outer array: timesteps, middle array: x values; inner array: real + imaginary part
                const lastPlusMinusSeparator = (s: string, separator: "+"|"-"): number => {
                    let start: number|undefined = undefined;
                    while (start === undefined || start >= 0) {
                        const idx: number = s.lastIndexOf(separator, start);
                        if (idx <= /* sic */ 0)
                            return -1;
                        if (s.charAt(idx - 1) !== "e")
                            return idx;
                        start = idx - 1;
                    }
                };
                const parseRealImaginary = (entry: string): [number, number]|null => {
                    entry = entry.replace(/\s/g, "");
                    const l: number = entry.length;
                    if (l === 0)
                        return null;
                    const idxPlus: number = lastPlusMinusSeparator(entry, "+");
                    const idx: number = idxPlus > /* sic! */ 0 ? idxPlus : lastPlusMinusSeparator(entry, "-");
                    if (idx <= 0) { // only a single entry present
                        const isReal: boolean = entry.indexOf("i") < 0;
                        const num: number = parseFloat(entry);
                        if (!isFinite(num))
                            return null
                        return isReal ? [num, 0] : [0, num];
                    }
                    const iIdx: number = entry.lastIndexOf("i");
                    if (iIdx < 0)
                        return null;
                    const secondIsImaginary: boolean = iIdx > idx;
                    const realPart = secondIsImaginary ? entry.substring(0, idx) : entry.substring(idx);
                    const imagPart = secondIsImaginary ? entry.substring(idx) : entry.substring(0, idx);
                    const real: number = parseFloat(realPart);
                    let imag: number = parseFloat(imagPart);
                    if (!isFinite(imag)) {
                        if (imagPart === "+i" || imagPart === "i")
                            imag = 1;
                        else if (imagPart === "-i")
                            imag = -1;
                    }
                    if (!isFinite(real) || !isFinite(imag))
                        return null;
                    return [real, imag];
                };
                while (true) {
                    const line0: [Array<string>, number]|null = SimulationUtils.nextRow(result, start, maxIdx + 1);
                    if (!line0)
                        break;
                    start = line0[1];
                    const line: Array<string> = line0[0];
                    const values: Array<[number, number]|null> = psindices.map(idx => parseRealImaginary(line[idx]));
                    const invalidIdx: number = values.findIndex(v => !v);
                    if (invalidIdx >= 0) {
                        reject("Wave function contains invalid value " + line[invalidIdx] + " at index " + invalidIdx + ": " + line);
                        return;
                    }
                    psi.push(values);
                }
                resolve([xs, psi]);
            };
            const task: StatusSink = progressReporter.add();
            reader.onerror = (event: ProgressEvent<FileReader>) => {
                reject(event.target?.error || event);
                task.errored();
            };
            reader.onprogress = (event: ProgressEvent<FileReader>) => {
                if (event.lengthComputable) 
                    task.progress(event.loaded, event.total);
            };
            reader.readAsText(file, "UTF-8");
        });
    }

    private static _parseObservablesFile(file: File, progressReporter: ProgressReporter): Promise<Array<ExpectationValues>|undefined> {
        if (!file)
            return Promise.resolve(undefined);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const result: string = event.target.result as string;
                const header: [Array<string>, number]|null = SimulationUtils.nextRow(result, 0, 2);
                if (!header) {
                    reject(new Error("Wave function file does not contain any data"));
                    return;
                }
                const x: number = header[0].indexOf("x");
                const p: number = header[0].indexOf("p");
                const x2: number = header[0].indexOf("x^2");
                const p2: number = header[0].indexOf("p^2");
                const E: number = header[0].indexOf("E");
                if (x < 0 || p<0 || x2 < 0 || p2< 0) {
                    reject(new Error("Observables file does not provide all required observables; header: " + JSON.stringify(header[1])));
                    return;
                }
                const exp: Array<ExpectationValues> = [];
                let start: number = header[1];
                while (true) {
                    const line0: [Array<string>, number]|null = SimulationUtils.nextRow(result, start, 4);
                    if (!line0)
                        break;
                    start = line0[1];
                    const line: Array<string> = line0[0];
                    const e: ExpectationValues = {
                        x: parseFloat(line[x]),
                        p: parseFloat(line[p]),
                        x2: parseFloat(line[x2]),
                        p2: parseFloat(line[p2]),
                        E: E >= 0 ? parseFloat(line[E]) || 1 : 1 // FIXME no default value
                    }
                    exp.push(e);
                }
                resolve(exp);
            };
            const task: StatusSink = progressReporter.add();
            reader.onerror = e => {
                reject(e);
                task.errored();
            };
            reader.onprogress = (event: ProgressEvent<FileReader>) => {
                if (event.lengthComputable) 
                    task.progress(event.loaded, event.total);
            };
            reader.readAsText(file, "UTF-8");
        });
    }

    static async parseQmFiles(id: string, waveFunction: File, observables: File, settings: File,
                psiTilde?: File, observablesQm?: File, potential?: File): Promise<QuantumSimulationResult> {
        const reporter: ProgressReporter = new ProgressReporter();
        reporter.start();
        try {
            return await SimulationUtils.parseQmFiles0(id, reporter, waveFunction, observables, settings, psiTilde, observablesQm, potential);
        } finally {
            reporter.end();
        }
    }

    private static async parseQmFiles0(id: string, reporter: ProgressReporter,  waveFunction: File, observables: File, settings: File,
            psiTilde?: File, observablesQm?: File, potential?: File): Promise<QuantumSimulationResult> {
        const waveFunctionPromise: Promise<[Array<number>, Array<Array<[number, number]>>]> = SimulationUtils._parseWaveFunctionFile(waveFunction, reporter);
        const observablesPromise: Promise<Array<ExpectationValues>> = SimulationUtils._parseObservablesFile(observables, reporter);
        const settingsPromise: Promise<QuantumSettings> = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const result: string = event.target.result as string;
                try {
                    resolve(JSON.parse(result));
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = reject;
            reader.readAsText(settings, "UTF-8");
        });
        const psiTildePromise: Promise<[Array<number>, Array<Array<[number, number]>>]|undefined> = SimulationUtils._parseWaveFunctionFile(psiTilde, reporter);
        const observablesQmPromise: Promise<Array<ExpectationValues>|undefined> = SimulationUtils._parseObservablesFile(observablesQm, reporter);
        const potentialPromise: Promise<[Array<number>, Array<Array<[number, number]>>]> = SimulationUtils._parseWaveFunctionFile(potential, reporter, {headerPrefix: "V"});
        const result = await Promise.all([waveFunctionPromise, observablesPromise, settingsPromise, psiTildePromise, observablesQmPromise, potentialPromise]);
        const x = result[0][0];
        const psi = result[0][1];
        const observables2 = result[1];
        const settings2: QuantumSettings = result[2];
        const waveFct: Array<Timeslice> = psi.map((values: Array<[number, number]>, idx: number) => {
            const slice: Timeslice = {
                x: x,
                waveFunction: values,
                observables: observables2[idx], // TODO
                settings: settings2
            };
            return slice;
        });
        let waveFctTilde: Array<Timeslice>|undefined = undefined;
        let obsQm: Array<ExpectationValues>|undefined = undefined;
        // outer index: time, inner index: x
        let potential2: Array<Array<number>>|undefined = undefined;
        if (result[3] && result[4]) {
            const x2 = result[3][0];
            const psiTilde = result[3][1];
            obsQm = result[4];
            waveFctTilde = psiTilde.map((values: Array<[number, number]>, idx: number) => {
                const slice: Timeslice = {
                    x: x2,
                    waveFunction: values,
                    observables: obsQm[idx],
                    settings: settings2
                };
                return slice;
            });
            if (result[5]) {
                // keep only real part
                potential2 = result[5][1].map(timeslice => timeslice.map(complex => complex[0]));
            }
        }
        /*
        if (psi.length !== observables2.length)
            throw new Error("Length of observables file does not match length of wave function (incompatible number of timesteps)");
        */ // TODO for now ignore observables
        return {
            id: id,
            x: x,
            timesteps: psi.map((_, idx) => idx * (settings2.deltaT || 1)),
            waveFunction: waveFct,
            observables: observables2,
            settings: settings2,
            waveFunctionTilde: waveFctTilde,
            observablesTilde: obsQm,
            potential: potential2
        };
    }

}

interface StatusSink {
    progress(done: number, total: number): void;
    errored(): void;
}
interface StatusSource {
    isValid(): boolean;
    status(): [number, number]|undefined;
}

class ProgressReporter {

    readonly #element: HTMLElement;
    readonly #progress: HTMLProgressElement;
    readonly #allTasks: Array<StatusSource> = [];
    #timer: number|undefined;
    #done: boolean = false;

    readonly #callback = () => {
        if (this.#done)
            return;
        // [bytes done, bytes total]
        const total: [number, number] = this.#allTasks
            .filter(t => t.isValid())
            .map(t => t.status() as [number, number])
            .reduce((val, next) => {
                val[0] = val[0] + next[0];
                val[1] = val[1] + next[1];
                return val;
            }, [0, 0]);
        const progress: number = total[1] > 0 ? total[0] / total[1] : 0;
        this.#progress.value = progress * 100;
        if (!(progress >= 1))
            this.start();
    };

    constructor() {
        this.#element = document.querySelector("#uploadProgress");
        this.#progress = this.#element.querySelector("progress");
    }

    add(): StatusSink {
        const sink: StatusSinkImpl = new StatusSinkImpl();
        this.#allTasks.push(sink);
        return sink;
    }

    start() {
        this.#element.hidden = false;
        this.#timer = window.requestAnimationFrame(this.#callback.bind(this));
    }

    end() {
        this.#done = true;
        this.#element.hidden = true; /// ?
        window.cancelAnimationFrame(this.#timer);
    }

}

class StatusSinkImpl implements StatusSink, StatusSource {
    #done: number;
    #total: number;
    progress(done: number, total: number): void {
        this.#done = done;
        this.#total = total;   
    }
    errored() {
        this.#total = undefined;
        this.#done = undefined;
    }
    status(): [number, number]|undefined {
        return this.#total !== undefined ? [this.#done, this.#total] : undefined;       
    }
    isValid(): boolean {
        return this.#total !== undefined;
    }
}