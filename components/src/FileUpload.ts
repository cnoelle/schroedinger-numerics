import { ClassicalSettings, ClassicalSystem, ExpectationValues, PhaseSpacePoint, QuantumSettings, QuantumSystem, QuantumSystemResidual, SimulationParameters, SimulationResult, SimulationResultClassical, SimulationResultQm, SimulationSettings, WaveFunctionData } from "./types.js";
import { JsUtils } from "./JsUtils.js";

class FileImport {

    private static _nextRow(str: string, start: number, minExpectedEntries?: number): [Array<string>, number]|null {
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
            return FileImport._nextRow(str, start + 1, minExpectedEntries);
        }
        const arr: Array<string> = str.substring(start, nextLineBreak).split(",").map(e => e.trim());
        if (arr.length < minExpectedEntries)
            return FileImport._nextRow(str, nextLineBreak + 1, minExpectedEntries)
        return [arr, nextLineBreak+1];
    }

    static async parseClassicalFiles(reporter: AggregatingReporter, id: string, points: File, 
                settings: File): Promise<SimulationResultClassical> {
        const pointsReporter = reporter.add();
        const settingsReporter = reporter.add();
        reporter.started();
        const pointsPromise: Promise<Array<PhaseSpacePoint>> = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const result: string = event.target.result as string;
                const header: [Array<string>, number]|null = FileImport._nextRow(result, 0, 2);
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
                const points0: Array<PhaseSpacePoint> = [];
                let start: number = header[1];
                while (true) {
                    const line0: [Array<string>, number]|null = FileImport._nextRow(result, start, 2);
                    if (!line0)
                        break;
                    start = line0[1];
                    const line: Array<string> = line0[0];
                    const point: PhaseSpacePoint = E >= 0 ? {
                            x: parseFloat(line[x]),
                            p: parseFloat(line[p]),
                            E: parseFloat(line[E])
                        } : { x: parseFloat(line[x]), p: parseFloat(line[p]) };
                    points0.push(point);
                }
                pointsReporter.isDone();
                resolve(points0);
            };
            reader.onerror = reject;
            reader.readAsText(points, "UTF-8");
            pointsReporter.started();
        });
        const settingsPromise: Promise<ClassicalSettings> = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const result: string = event.target.result as string;
                try {
                    const result1 = JSON.parse(result);
                    settingsReporter.isDone();
                    resolve(result1);
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = reject;
            reader.readAsText(settings, "UTF-8");
            settingsReporter.started();
        });
        try {
            const result = await Promise.all([pointsPromise, settingsPromise]);
            const pointsResult: Array<PhaseSpacePoint> = result[0];
            const settings2: ClassicalSettings = result[1];
            const trajectory: Array<ClassicalSystem> = pointsResult.map((point, idx) => {
                return {
                    time: idx * settings2.deltaT,
                    point: point
                };
            });
            return {
                id: id,
                settingsClassical: settings2,
                timesteps: trajectory
            };
        } catch (e) {
            reporter.error(e);
        } finally {
            reporter.isDone();
        }
    }

    public static _parseWaveFunctionFile(stream: ReadableStream, fileName: string,
            progressReporter: AggregatingReporter, options?: {headerPrefix?: string}): Promise<[Array<number>, Array<Array<[number, number]>>]|undefined> {
        if (!stream)
            return Promise.resolve(undefined);
        const fl = fileName.toLowerCase();
        if (fl.endsWith(".gz"))
            return FileImport._parseWaveFunctionFileGzip(stream, progressReporter, options);
        else if (fl.endsWith(".dat"))
            return FileImport._parseWaveFunctionFileBinary(stream, progressReporter, options);
        else
            return FileImport._parseWaveFunctionFileCsv(stream, progressReporter, options);
    }

    private static _parseWaveFunctionFileCsv(stream: ReadableStream, progressReporter: AggregatingReporter, options?: {headerPrefix?: string}): Promise<[Array<number>, Array<Array<[number, number]>>]|undefined> {
        const headerPrefix: string = (options?.headerPrefix || "Psi") + "(";
        const reporter: ProgressSink = progressReporter.add();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const result: string = event.target.result as string;
                // expect entries of the form Psi(x0), Psi(x1), ..., Psi(xk)
                const header: [Array<string>, number]|null = FileImport._nextRow(result, 0, 2);
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
                    const line0: [Array<string>, number]|null = FileImport._nextRow(result, start, maxIdx + 1);
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
                reporter.isDone();
                resolve([xs, psi]);
            };
            reader.onerror = (event: ProgressEvent<FileReader>) => reject(event.target?.error || event);
            reader.onprogress = (event: ProgressEvent<FileReader>) => {
                if (event.lengthComputable) 
                    reporter.progress(event.loaded, event.total);
            };
            new Response(stream).blob().then(blob => {
                reader.readAsText(blob, "UTF-8");
                reporter.started();
            });
        
        });
    }

    private static async _parseWaveFunctionFileGzip(stream: ReadableStream, progressReporter: AggregatingReporter, options?: {headerPrefix?: string}): Promise<[Array<number>, Array<Array<[number, number]>>]|undefined> {
        const ds = new DecompressionStream("gzip");
        const decompressedStream: ReadableStream<Uint8Array> = stream.pipeThrough(ds);
        //const blob: Blob = await new Response(decompressedStream).blob();
        return FileImport._parseWaveFunctionFileBinary(stream, progressReporter, options);
    }

    private static _parseWaveFunctionFileBinary(stream: ReadableStream, progressReporter: AggregatingReporter, 
            options?: {headerPrefix?: string}): Promise<[Array<number>, Array<Array<[number, number]>>]|undefined> {
        const headerPrefix: string = (options?.headerPrefix || "Psi") + "(";
        const reporter: ProgressSink = progressReporter.add();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const result: ArrayBuffer = event.target.result as ArrayBuffer;
                const decoder = new TextDecoder();
                const magic = decoder.decode(result.slice(0, 12));
                if (magic !== "schroedinger")
                    throw new Error("Invalid wave function file");
                const asUint8 = new Uint8Array(result);
                let symbol0: string|undefined;
                let nulTerm: number = -1;
                for (let idx=12; idx<result.byteLength; idx++) {
                    if (asUint8[idx] == 0) {
                        symbol0 = decoder.decode(result.slice(12, idx));
                        nulTerm = idx;
                        break;
                    }
                }
                const rep: string = decoder.decode(result.slice(nulTerm+1, nulTerm+2));
                const numPoints = new DataView(result, nulTerm + 2).getUint32(0, true);
                const dataViewPoints: DataView = new DataView(result, nulTerm + 6);
                const xs = new Array(numPoints);
                for (let idx=0; idx<numPoints; idx++) {
                    xs[idx] = dataViewPoints.getFloat32(4 * idx, true);
                }
                const dataView: DataView = new DataView(result, nulTerm + 6 + numPoints * 4);
                // one row consists of a Float32 value (max absolute value) and numPoints * 2 bytes (real + imaginary part)
                const singleRowLength: number = 4 + 2 * numPoints;
                const expectedRows: number = dataView.byteLength / singleRowLength;
                const values: Array<Array<[number, number]>> = [];
                for (let row=0; row<expectedRows; row++) {
                    const startByte = row * singleRowLength;
                    const max = dataView.getFloat32(startByte, true);
                    const points: Array<[number, number]> = new Array(numPoints);
                    const pointsStartByte = startByte + 4;
                    for (let idx=0; idx<numPoints; idx++) {
                        const realImag: [number, number] = [
                            dataView.getInt8(pointsStartByte + 2 * idx)/127 * max,
                            dataView.getInt8(pointsStartByte + 2 * idx + 1)/127 * max
                        ];
                        points[idx] = realImag;
                    }
                    values.push(points);
                }
                reporter.isDone();
                resolve([xs, values]);
            };
            reader.onerror = (event: ProgressEvent<FileReader>) => reject(event.target?.error || event);
            reader.onprogress = (event: ProgressEvent<FileReader>) => {
                if (event.lengthComputable) 
                    reporter.progress(event.loaded, event.total);
            };
            new Response(stream).blob().then(blob => {
                reader.readAsArrayBuffer(blob);
                reporter.started();
            });
        });
    }

    static parseObservablesFileInternal(
            result: string,
            resolve: (result: Array<ExpectationValues>) => void, 
            reject: (error: any) => void,
            progressReporter: ProgressSink,
            options?: {requireSquareValues?: boolean}) {
        try {
            const header: [Array<string>, number]|null = FileImport._nextRow(result, 0, 2);
            if (!header) {
                reject(new Error("Wave function file does not contain any data"));
                return;
            }
            const x: number = header[0].indexOf("x");
            const p: number = header[0].indexOf("p");
            const x2: number = header[0].indexOf("x^2");
            const p2: number = header[0].indexOf("p^2");
            const E: number = header[0].indexOf("E");
            if (x < 0 || p<0 || options?.requireSquareValues && (x2 < 0 || p2< 0)) {
                reject(new Error("Observables file does not provide all required observables; header: " + JSON.stringify(header[1])));
                return;
            }
            const exp: Array<ExpectationValues> = [];
            let start: number = header[1];
            while (true) {
                const line0: [Array<string>, number]|null = FileImport._nextRow(result, start, 4);
                if (!line0)
                    break;
                start = line0[1];
                const line: Array<string> = line0[0];
                const e: ExpectationValues = {
                    x: parseFloat(line[x]),
                    p: parseFloat(line[p]),
                    x2: x2 < 0 ? undefined : parseFloat(line[x2]),
                    p2: p2 < 0 ? undefined : parseFloat(line[p2]),
                    E: E >= 0 ? parseFloat(line[E]) || 1 : 1 // FIXME no default value
                }
                exp.push(e);
            }
            resolve(exp);
            progressReporter.isDone();
        } catch (e) {
            reject(e);
        }

    }

    private static _parseObservablesFile(file: File, progressReporter: AggregatingReporter): Promise<Array<ExpectationValues>|undefined> {
        if (!file)
            return Promise.resolve(undefined);
        const reporter: ProgressSink = progressReporter.add();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) =>
                FileImport.parseObservablesFileInternal(event.target.result as string, 
                        resolve, reject, reporter, {requireSquareValues: true});
            reader.onerror = reject;
            reader.onprogress = (event: ProgressEvent<FileReader>) => {
                if (event.lengthComputable) 
                    reporter.progress(event.loaded, event.total);
            };
            reader.readAsText(file, "UTF-8");
            reporter.started();
        });
    }

    static async parseQmFiles(reporter: AggregatingReporter, id: string, waveFunction: File, observables: File, settings: File,
                psiP?: File, psiTilde?: File, phiP?: File,
                observablesQm?: File, potential?: File, classicalResults?: SimulationResultClassical): Promise<SimulationResultQm> {
        reporter.started();
        try {
            return await FileImport._parseQmFiles0(id, reporter, waveFunction, observables, settings, psiP, 
                psiTilde, phiP, observablesQm, potential, classicalResults);
        } catch (e) {
            reporter.error(e?.toString());
            throw e;
        } finally {
            reporter.isDone();
        }
    }

    private static _potentialRange(settings0: Partial<QuantumSettings>, wf?: QuantumSystem): [number, number]|undefined {
        let V = settings0.V;
        if (V === undefined) {
            if (settings0.V_coefficients && wf) {
                    const fact = (num: number): number => {
                        if (num === 0 || num === 1) 
                            return 1;
                        let result = num;
                        while (num > 1) { 
                        num--;
                        result *= num;
                        }
                        return result;
                    };
                    V = wf.psi.basePoints.map(x => 
                        settings0.V_coefficients.map((C, idx) => C/fact(idx) * Math.pow(x, idx)).reduce((a,b) => a+b, 0));
            } else {
                return undefined;
            }
        }
        return [Math.min(...V), Math.max(...V)];
    }

    static async parseQmResults(id: string, reporter: AggregatingReporter,
            settingsPromise: Promise<Omit<QuantumSettings, "potentialValueRange">>,
            observablesPromise: Promise<Array<ExpectationValues>>,
            psiPromise: Promise<[Array<number>, Array<Array<[number, number]>>]>,
            psiPPromise: Promise<[Array<number>, Array<Array<[number, number]>>]>,
            phiPromise: Promise<[Array<number>, Array<Array<[number, number]>>]|undefined>,
            phiPPromise: Promise<[Array<number>, Array<Array<[number, number]>>]|undefined>,
            observablesQmPromise: Promise<Array<ExpectationValues>|undefined>,
            potentialPromise: Promise<[Array<number>, Array<Array<[number, number]>>]>,
            classicalResults?: SimulationResultClassical
        ): Promise<SimulationResultQm> {
        const result = await Promise.all([settingsPromise, observablesPromise, psiPromise, 
            psiPPromise, phiPromise, phiPPromise, observablesQmPromise, potentialPromise]);
        const x = result[2][0];
        const psi = result[2][1];
        const hasPsiP: boolean = !!result[3];
        const psiP1 = hasPsiP ? result[3][1] : undefined;
        const p = hasPsiP ? result[3][0] : undefined;
        const observables2 = result[1];
        const settings1a: Omit<QuantumSettings, "potentialValueRange"> = result[0];
        let waveFct: Array<QuantumSystem> = psi.map((values: Array<[number, number]>, idx: number) => {
            const observables: ExpectationValues = observables2[idx];
            const qmSystem: QuantumSystem = {
                time: idx * settings1a.deltaT!,
                psi: {...{
                    representation: "x",
                    basePoints: x,
                    values: values,
                }, ...observables},
                psiP: hasPsiP ? {
                    representation: "p",
                    basePoints: p,
                    values: psiP1[idx],
                } : undefined
            };
            return qmSystem;
        });
        const potRange: [number, number]|undefined = FileImport._potentialRange(settings1a, waveFct[0]);
        const settings2: QuantumSettings = {...settings1a, potentialValueRange: potRange};
        if (result[4] && result[6] && classicalResults) {
            const x2 = result[4][0];
            const phi = result[4][1];
            if (phi.length !== classicalResults.timesteps.length 
                    || phi.length !== waveFct.length) {
                const msg = "Incompatible lengths between wave functions and/or trajectory"
                reporter.error(msg);
                throw new Error(msg);
            }
            const obsQm: Array<ExpectationValues> = result[6];
            // outer index: time, inner index: x
            let potential2: Array<Array<number>>|undefined = undefined;
            if (result[7]) {
                // keep only real part
                potential2 = result[7][1].map(timeslice => timeslice.map(complex => complex[0]));
            }
            const hasPhiP: boolean = !!result[5];
            const phiP1 = hasPhiP ? result[5][1] : undefined;
            const pPhi = hasPhiP ? result[5][0] : undefined;
            const waveFctPhi: Array<QuantumSystemResidual> = phi.map((values: Array<[number, number]>, idx: number) => {
                const psiResults = waveFct[idx];
                const observablesPhi: ExpectationValues = obsQm[idx];
                const systemPhi: {phi: WaveFunctionData; phiP?: WaveFunctionData, phiPotential?: Array<number>;} = {   
                    phi: {...{
                        representation: "x",
                        basePoints: x2,
                        values: values
                    }, ...observablesPhi},
                    phiP: hasPhiP ? {
                        representation: "p",
                        basePoints: pPhi,
                        values: phiP1[idx]
                    } : undefined,
                    phiPotential: potential2 ? potential2[idx] : undefined
                };
                const phaseSpaceResult: ClassicalSystem = classicalResults.timesteps[idx];
                const overallResult: QuantumSystemResidual = {...psiResults, ...systemPhi, ...phaseSpaceResult};
                return overallResult;
            });
            waveFct = waveFctPhi;
        }
        return {
            id: id,
            x: x,
            /* p: ... TODO */
            timesteps: waveFct,
            settingsQm: settings2
        };
    }

    private static async _parseQmFiles0(id: string, reporter: AggregatingReporter,  waveFunction: File, observables: File, settings: File,
            psiP?: File, psiTilde?: File, phiP?: File, observablesQm?: File, potential?: File, classicalResults?: SimulationResultClassical): Promise<SimulationResultQm> {
        const settingsReporter = reporter.add();
        const psiPromise: Promise<[Array<number>, Array<Array<[number, number]>>]> = FileImport._parseWaveFunctionFile(waveFunction.stream(), waveFunction.name, reporter);
        const psiPPromise: Promise<[Array<number>, Array<Array<[number, number]>>]> = FileImport._parseWaveFunctionFile(psiP?.stream(), psiP?.name, reporter);
        const observablesPromise: Promise<Array<ExpectationValues>> = FileImport._parseObservablesFile(observables, reporter);
        const phiPromise: Promise<[Array<number>, Array<Array<[number, number]>>]|undefined> = FileImport._parseWaveFunctionFile(psiTilde?.stream(), psiTilde?.name, reporter);
        const phiPPromise: Promise<[Array<number>, Array<Array<[number, number]>>]|undefined> = FileImport._parseWaveFunctionFile(phiP?.stream(), phiP?.name, reporter);
        const observablesQmPromise: Promise<Array<ExpectationValues>|undefined> = FileImport._parseObservablesFile(observablesQm, reporter);
        const potentialPromise: Promise<[Array<number>, Array<Array<[number, number]>>]> = FileImport._parseWaveFunctionFile(potential?.stream(), potential?.name, reporter, {headerPrefix: "V"});
        const settingsPromise: Promise<Omit<QuantumSettings, "potentialValueRange">> = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                const result: string = event.target.result as string;
                try {
                    const result1: Omit<QuantumSettings, "potentialValueRange"> = JSON.parse(result);
                    settingsReporter.isDone();
                    resolve(result1);
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = reject;
            reader.readAsText(settings, "UTF-8");
            settingsReporter.started();
        });
        return FileImport.parseQmResults(id, reporter, settingsPromise, observablesPromise, psiPromise,
                psiPPromise, phiPromise, phiPPromise, observablesQmPromise, potentialPromise, classicalResults);
    }

}

interface ProgressSink {
    started(): void;
    progress(done: number, total: number): void;
    isDone(): void;
    error(reason?: any): void;
}

type UploadStatus = "inactive"|"active"|"done"|"errored";

class SingleTaskReporter implements ProgressSink {

    #status: UploadStatus = "inactive";
    #done: number = NaN;
    #total: number = NaN;
    #errorReason?: any;
    
    constructor(private readonly _sink: ProgressSink) {}

    started(): void {
        this.#status = "active";
        /*this._sink.started();*/
    }

    progress(done: number, total: number): void {
        this.#done = done;
        this.#total = total;
        this._sink.progress(done, total);
    }

    done(): number {
        return this.#done;
    }

    total(): number {
        return this.#total;
    }

    isDone(): void {
        if (Number.isFinite(this.#total) && this.#total > 0)
            this.#done = this.#total;
        else {
            this.#done = 1;
            this.#total = 1;
        }
        this.#status = "done";
        /*this._sink.isDone();*/
    }

    error(reason?: any): void {
        this.#errorReason = reason;
        this.#status = "errored";
        this._sink.error(reason);
    }

    status(): UploadStatus {
        return this.#status;
    }

}

class AggregatingReporter implements ProgressSink {

    readonly #reporters: Array<SingleTaskReporter> = [];
    #done: boolean = false;

    constructor(private readonly _sink: ProgressSink) {
    }

    add(): SingleTaskReporter {
        const sink: SingleTaskReporter = new SingleTaskReporter(this);
        this.#reporters.push(sink);
        return sink;
    }

    started(): void {
        if (this.#done)
            return;
        this._sink.started();
    }

    progress(done: number, total: number): void {
        if (this.#done)
            return;
        const doneAgg = this.#reporters.map(r => r.done()).reduce((a,b) => a+b, 0);
        const totalAgg = this.#reporters.map(r => r.total()).reduce((a,b) => a+b, 0);
        if (Number.isFinite(doneAgg) && Number.isFinite(totalAgg))
            this._sink.progress(doneAgg, totalAgg);
    }

    isDone(): void {
        if (this.#done)
            return;
        this._sink.isDone();
    }

    error(reason?: any): void {
        this.#done = true;
        this._sink.error(reason);
    }

}


export class FileUpload extends HTMLElement {

    private static DEFAULT_TAG: string = "wf-upload";
    private static _tag: string|undefined;

    static get observedAttributes(): Array<string> {
        return []; 
    }

    /**
     * Call once to register the new tag type "<wf-upload></wf-upload>"
     * @param tag 
     */
    static register(tag?: string) {
        tag = tag || FileUpload.DEFAULT_TAG;
        if (tag !== FileUpload._tag) {
            customElements.define(tag, FileUpload);
            FileUpload._tag = tag;
        }
    }

    /**
     * Retrieve the registered tag type for this element type, or undefined if not registered yet.
     */
    static tag(): string|undefined {
        return FileUpload._tag;
    }

    readonly #datasetIdField: HTMLInputElement;
    readonly #fileSelector: HTMLInputElement;
    readonly #fileUpload: HTMLInputElement;
    readonly #progress: HTMLProgressElement;
    readonly #progressReporter: ProgressSink;

    // state
    #uploadRunning: boolean = false;

    /**
     *  <div class="upload-dataset">
            <div>Dataset</div>
            <div><input type="text" value="default" id="uploadDataset" placeholder="Dataset name" title="Provide a name for the new dataset"></div>
        </div>        
        <div id="uploadControl" class="upload-control">
            <input type="file" multiple="multiple" accept=".csv,.json" id="fileSelector" title="Select result files for display">
            <input type="button" value="Upload" id="fileUpload" disabled="disabled" title="Select files first">
        </div>
        <div class="overlay" id="uploadProgress" hidden="hidden">
            <div>
                <div>Loading...</div>
                <progress max="100" value="0">0</progress>
            </div>
        </div>
     */
    constructor() {
        super();
        const style: HTMLStyleElement = document.createElement("style");
        //style.textContent = ":host { position: relative; display: block; }";
        style.textContent = ".upload-dataset { display: flex; column-gap: 1em; margin-bottom: 1em; } "
            + ".overlay { position: fixed; width: 100%; height: 100%; top: 0; left: 0; z-index: 10; "
            +      "background-color: rgb(0,0,0, 0.2); display: flex; justify-items: center; "
            +      "justify-content: space-around;     align-items: center; } " 
            /* https://stackoverflow.com/questions/23772673/hidden-property-does-not-work-with-flex-box */
            +  ".overlay[hidden]{ display:none; } "
            + ".overlay>div>div {font-size: 1.8em; margin-bottom: 1em; } " 
            + ".overlay>div>progress { transform: scale(2); }";
        this.attachShadow({mode: "open"});
        this.shadowRoot.appendChild(style);
        const uploadDataset = JsUtils.createElement("div", {classes: ["upload-dataset"], parent: this.shadowRoot});
        JsUtils.createElement("div", {text: "Dataset", parent: uploadDataset});
        this.#datasetIdField = JsUtils.createElement("input", {attributes: new Map([["type", "text"], ["value", "default"], ["placeholder", "Dataset name"]]), 
                id: "uploadDataset", title: "Provide a name for the new dataset", parent: JsUtils.createElement("div", {parent: uploadDataset})});
        const uploadControl = JsUtils.createElement("div", {id: "uploadControl", classes: ["upload-control"],
                parent: this.shadowRoot});
        const fileSelector = JsUtils.createElement("input", {attributes: new Map([["type", "file"], ["value", "Upload"], 
                ["multiple", "multiple"], ["accept", ".csv,.json,.dat,.gz"]]), 
            id: "fileSelector", title: "Select result files for display", parent: uploadControl});        
        this.#fileSelector = fileSelector;
        const fileUpload = JsUtils.createElement("input", {attributes: new Map([["type", "button"], ["value", "Upload"], 
                ["multiple", "multiple"], ["disabled", "disabled"]]),
            id: "fileUpload", title: "Select files first", parent: uploadControl});
        this.#fileUpload = fileUpload;
        const progressOverlay = JsUtils.createElement("div", {classes: ["overlay"], id: "uploadProgress", 
            attributes: new Map([["hidden", "hidden"]]), parent: this.shadowRoot});
        const overlay2 = JsUtils.createElement("div", {parent: progressOverlay});
        JsUtils.createElement("div", {text: "Loading...", parent: overlay2});
        this.#progress = JsUtils.createElement("progress", {parent: overlay2, 
                attributes: new Map([["max", "100"], ["value", "0"]])});                
        this.#progress.value = 0;  // ?
        const progressEl = this.#progress;
        this.#progressReporter = {
            started() {
                progressOverlay.hidden = false;
            },
            progress(done: number, total: number) {
                const progress: number = total > 0 ? done / total : 0;
                progressEl.value = progress * 100;
            }, 
            isDone() {
                progressOverlay.hidden = true;
            },
            error(reason?: any) {
                console.error("Error uploading files", reason);
                progressOverlay.hidden = false;
            }   
        };
        const enableFileUpload = (enable: boolean) => {
            fileUpload.disabled = !enable;
            fileUpload.title = enable ? "Start upload" : "Select files first";
        };
        fileSelector.addEventListener("change", () => enableFileUpload(fileSelector.files.length > 0));
        fileUpload.addEventListener("click", this._upload.bind(this));
    }   

    connectedCallback() {
        this.#fileSelector.dispatchEvent(new Event("change"));
    }

    private async _upload() {
        if (this.#uploadRunning)
            return;
        const files: Array<File> = Array.from(this.#fileSelector.files)
            .filter(fl => fl.name.toLowerCase().endsWith(".csv") || 
                    fl.name.toLowerCase().endsWith(".json") || 
                    fl.name.toLowerCase().endsWith(".dat") || 
                    fl.name.toLowerCase().endsWith(".dat.gz"));
        if (files.length === 0)
            return;
        const psi: File|undefined = files.find(fl => fl.name.toLowerCase().startsWith("psi."));
        const psiP: File|undefined = files.find(fl => fl.name.toLowerCase().startsWith("psip.")); 
        const observables: File|undefined = files.find(fl => fl.name.toLowerCase() === "observables.csv");
        const settings: File|undefined = files.find(fl => fl.name.toLowerCase() === "settings.json");
        const points: File|undefined = files.find(fl => fl.name.toLowerCase() === "points.csv");
        // the three below are present for calculations in the residual rep only, besides all the other files
        const psiTilde: File|undefined = files.find(fl => fl.name.toLowerCase().startsWith("psitilde.") 
            || fl.name.toLowerCase().startsWith("phi."));
        const phiP: File|undefined = files.find(fl => fl.name.toLowerCase().startsWith("phip."));
        const potential: File|undefined = files.find(fl => fl.name.toLowerCase() === "v_t.csv");
        const observablesQm: File|undefined = files.find(fl => fl.name.toLowerCase() === "observables.csv");
        const isQuantum: boolean = !!psi && !!observables;
        const isClassical: boolean = !!points;
        if ((!isQuantum && !isClassical) || !settings) {
            console.log("Files missing");
            // TODO consume those errors
            this.dispatchEvent(new CustomEvent<Error>("error", {detail: new Error("Files missing")}));
            return;
        }
        const id: string = this.#datasetIdField.value;
        if (!id) {
            console.log("Id not set");
            this.dispatchEvent(new CustomEvent<Error>("error", {detail: new Error("Id not set")}));
            return;
        }
        this.#uploadRunning = true;
        try {
            const reporter: AggregatingReporter = new AggregatingReporter(this.#progressReporter);
            const resultsClassical = isClassical ? await FileImport.parseClassicalFiles(reporter, id, points, settings) : undefined;
            const resultsQm = isQuantum ? await FileImport.parseQmFiles(reporter, id, psi, observables, settings, psiP, psiTilde, phiP, observablesQm, potential, resultsClassical) : undefined;
            const results = isQuantum && isClassical ? {...resultsQm, classicalTrajectory: resultsClassical} : isQuantum ? resultsQm : resultsClassical;
            this.dispatchEvent(new CustomEvent<SimulationResult>("upload", {detail: results}));
        } catch(e) {
            console.error("Failed to upload results", e);  // TODO show to user
            this.dispatchEvent(new CustomEvent<Error>("error", {detail: new Error("Failed to upload results " + e)}));
        } finally {
            this.#uploadRunning = false;
        }
    }

}

export interface LabeledItem {
    id: string;
    label?: string;
    description?: string;
}

export interface RemoteDataset extends LabeledItem {
    type: "qm"|"classical";
    baseUrl: string;
    settings: string;
    trajectory?: string;
    psi?: string;
    psiP?: string;
    phi?: string;
    phiP?: string;
    expectationValues?: string;
    effectivePotential?: string;
}

export interface DatasetGroup extends LabeledItem {
    datasets: Array<RemoteDataset>;
}

export interface DatasetIndex {
    datasetGroups: Array<DatasetGroup>;
}

// TODO show spinner on load?
export class StaticResourcesImport extends HTMLElement {

    private static DEFAULT_TAG: string = "static-resources-import";
    private static _tag: string|undefined;

    static get observedAttributes(): Array<string> {
        return ["index-url"]; 
    }

    /**
     * Call once to register the new tag type "<static-resources-import></static-resources-import>"
     * @param tag 
     */
    static register(tag?: string) {
        tag = tag || StaticResourcesImport.DEFAULT_TAG;
        if (tag !== StaticResourcesImport._tag) {
            customElements.define(tag, StaticResourcesImport);
            StaticResourcesImport._tag = tag;
        }
    }

    /**
     * Retrieve the registered tag type for this element type, or undefined if not registered yet.
     */
    static tag(): string|undefined {
        return StaticResourcesImport._tag;
    }

    #indexUrl: string|undefined;
    #connected: boolean = false;
    #index: DatasetIndex|undefined;

    set indexUrl(url: string|undefined) {
        this.#indexUrl = url;
        this._retrieveIndex();
    }

    get indexUrl(): string|undefined {
        return this.#indexUrl;
    }

    readonly #container: HTMLElement;
    readonly #selector: HTMLSelectElement;
    readonly #progressReporter: ProgressSink;
    #uploadRunning: boolean = false;

    constructor() {
        super();
        const shadow: ShadowRoot = this.attachShadow({mode: "open"});

        const style: HTMLStyleElement = document.createElement("style");
        style.textContent = ":host { position: relative; } "
            + ".import-container {display: flex; column-gap: 1em;} "
            + ".import-container[hidden] {display: none; }";
        shadow.append(style);
        const container = JsUtils.createElement("div", {parent: shadow, classes: ["import-container"],
            attributes: new Map([["hidden", "true"]])})

        const title = JsUtils.createElement("div", {parent: container, text: "Dataset", 
            title: "Load a pre-configured dataset"});

        const select = JsUtils.createElement("select", {parent: container, title: "Select a pre-configured dataset"});
        const button = JsUtils.createElement("button", {parent: container, text: "Load", title: "Load dataset"});
        button.disabled = !select.value;
        select.addEventListener("change", 
            event => button.disabled = !((event.currentTarget as HTMLSelectElement).value));
        button.addEventListener("click", () => this._load());
        this.#container = container;
        this.#selector = select;
        // TODO
        this.#progressReporter = {
            started() {
                //progressOverlay.hidden = false;
            },
            progress(done: number, total: number) {
                const progress: number = total > 0 ? done / total : 0;
                //progressEl.value = progress * 100;
            }, 
            isDone() {
                //progressOverlay.hidden = true;
            },
            error(reason?: any) {
                console.error("Error uploading files", reason);
                //progressOverlay.hidden = false;
            }   
        };
    }

    attributeChangedCallback(name: string, oldValue: string|null, newValue: string|null) {
        const attr: string = name.toLowerCase();
        switch (attr) {
        case "index-url":
            this.indexUrl = newValue || undefined;
            break; 
        }
    }


    connectedCallback() {
        this.#connected = true;
        this._retrieveIndex();
    }

    disconnectedCallback() {
        this.#connected = false;
    }

    private async _load() {
        const selectedValue = this.#selector.value;
        const selected: RemoteDataset|undefined 
            = this.#index.datasetGroups.flatMap(g => g.datasets).find(ds => ds.id === selectedValue);
        if (!selected || this.#uploadRunning)
            return;
        const reporter: AggregatingReporter = new AggregatingReporter(this.#progressReporter);
        this.#uploadRunning = true;
        try {
            const results = await this._loadInternal(selected, reporter);
            this.dispatchEvent(new CustomEvent<SimulationResult>("upload", {detail: results}));
        } catch(e) {
            console.error("Failed to upload results", e);  // TODO show to user
            reporter.error(e);
            this.dispatchEvent(new CustomEvent<Error>("error", {detail: new Error("Failed to upload results " + e)}));
        } finally {
            this.#uploadRunning = false;
        }

    }

    private static _concat(url: string, file: string): string {
        if (!url)
            return file;
        const endsWith = url.endsWith("/");
        const startsWith = file.startsWith("/");
        if (endsWith && startsWith)
            file = file.substring(1);
        else if (!endsWith && !startsWith)
            file = "/" + file;
        return url + file;
    }

    private static _getTextFile(url: string, type: "json"|"csv"): Promise<string|any> {        
        return fetch(url, {headers: {Accept: type === "json" ? "application/json" : "text/csv"}})
            .then(async result => {
                if (!result.ok) {
                    const t = await result.text();
                    let msg = "Failed to download file " + url + ": " + result.status + ", " + result.statusText;
                    if (t)
                        msg += " (" + t + ")";
                    throw new Error(t);
                }
                return type === "json" ? result.json() : result.text();
            });
    }

    private static _getRemoteFile(url: string, options?: {Accept?: string}): Promise<ReadableStream> { 
        const init: RequestInit = {};
        if (options?.Accept)
            init.headers = {Accept: options.Accept};
        return fetch(url, init)
            .then(async result => {
                if (!result.ok) {
                    const t = await result.text();
                    let msg = "Failed to download file " + url + ": " + result.status + ", " + result.statusText;
                    if (t)
                        msg += " (" + t + ")";
                    throw new Error(t);
                }
                return result.body;
            });
    }

    private async _loadInternal(dataset: RemoteDataset, progressReporter: AggregatingReporter): Promise<SimulationResult> {
        const url: string = dataset.baseUrl;
        const settingsUrl = StaticResourcesImport._concat(url, dataset.settings);
        const settingsReporter = progressReporter.add();
        settingsReporter.started();
        const settingsPromise: Promise<SimulationSettings> 
            = StaticResourcesImport._getTextFile(settingsUrl, "json");
        settingsPromise.then(() => settingsReporter.isDone());
        const parseObservables = (file: string|undefined) => {
            if (!file)
                return Promise.resolve(undefined);
            const obsUrl = StaticResourcesImport._concat(url, file);
            const reporterObs = progressReporter.add();
            const obsPromise = new Promise((resolve, reject) => {
                const content: Promise<string> = StaticResourcesImport._getTextFile(obsUrl, "csv");
                content
                    .then(content0 => FileImport.parseObservablesFileInternal(content0, resolve, reject, reporterObs))
                    .catch(e => reject(e));
            });
            return obsPromise;
        };
        const trajectoryPromise = parseObservables(dataset.trajectory);
        let classicalResult: SimulationResultClassical|undefined;
        if (dataset.trajectory) {
            const settings: ClassicalSettings = await settingsPromise as ClassicalSettings;
            const trajectory: Array<ExpectationValues> = await trajectoryPromise;
            const deltaT = settings.deltaT || 1;
            classicalResult = {
                id: dataset.id,
                timesteps: trajectory.map((exp, idx) => {return {time: idx*deltaT, point: exp};}),
                settingsClassical: settings as ClassicalSettings
            };
            if (dataset.type === "classical")
                return classicalResult;
        }
        const parseWaveFunctionFile = (file: string|undefined, options?: {headerPrefix?: string}) => {
            if (!file)
                return Promise.resolve(undefined);
            const wfUrl = StaticResourcesImport._concat(url, file);
            const accept = file.endsWith("csv") ? "text/csv" : "application/octet-stream";
            const streamPromise: Promise<ReadableStream<Uint8Array>> 
                = StaticResourcesImport._getRemoteFile(wfUrl, {Accept: accept})
            const wfPromise = streamPromise.then(stream => 
                FileImport._parseWaveFunctionFile(stream, file, progressReporter, options));
            return wfPromise;
        }
        const psiPromise = parseWaveFunctionFile(dataset.psi);
        const psiPPromise = parseWaveFunctionFile(dataset.psiP);
        const phiPromise = parseWaveFunctionFile(dataset.phi);
        const phiPPromise = parseWaveFunctionFile(dataset.phiP);
        const observablesQmPromise = parseObservables(dataset.expectationValues);
        const potentialPromise = parseWaveFunctionFile(dataset.effectivePotential, {headerPrefix: "V"});

        return FileImport.parseQmResults(dataset.id, progressReporter, settingsPromise as any, 
            observablesQmPromise, psiPromise, psiPPromise, phiPromise, phiPPromise, 
            observablesQmPromise, potentialPromise, classicalResult);
    }

    private _setIndex(index: DatasetIndex|undefined) {
        if (index !== undefined && !index.datasetGroups)
            throw new Error("Unexpected index format " + JSON.stringify(index));
        this.#index = index;
        this._setSelector(index);
        if (index)
            this.#container.removeAttribute("hidden");
        else
            this.#container.setAttribute("hidden", "hidden");
    }

    private _setSelector(index: DatasetIndex|undefined) {
        this._clearSelector();
        if (index) {
            const frag = document.createDocumentFragment();
            index.datasetGroups.forEach(group => {
                const optgroup = JsUtils.createElement("optgroup", {parent: frag, title: group.description});
                optgroup.label = group.label || group.id;
                group.datasets.forEach(ds => {
                    const opt = JsUtils.createElement("option", {parent: optgroup, title: ds.description});
                    opt.value = ds.id;
                    opt.innerText = ds.label || ds.id;
                });
            });
            this.#selector.appendChild(frag);
        }
        this.#selector.dispatchEvent(new Event("change"));
    }

    private _clearSelector() {
        const selector = this.#selector;
        while (selector.hasChildNodes())
            selector.firstChild.remove();
    }

    private _retrieveIndex() {
        const url = this.#indexUrl;
        if (!url || !this.#connected)
            return;
        fetch(url, {
            headers: {Accept: "application/json"}
        }).then(async result => {
            if (!result.ok) {
                const t = await result.text();
                let msg = "Failed to download index from " + url + ": " + result.status + ", " + result.statusText;
                if (t)
                    msg += " (" + t + ")";
                throw new Error(t);
            }
            return result.json();
        }).then(response => this._setIndex(response))
        .catch(e => this.dispatchEvent(new CustomEvent<Error>("error", {detail: new Error("Failed to load index " + e)})));
    }

}

