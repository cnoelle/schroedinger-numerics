import { ClassicalSettings, ClassicalSystem, ExpectationValues, PhaseSpacePoint, QuantumSettings, QuantumSystem, QuantumSystemResidual, SimulationParameters, SimulationResult, SimulationResultClassical, SimulationResultQm, WaveFunctionData } from "./types.js";
import { JsUtils } from "./JsUtils.js";

/**
 * TODO add psiP and phiP files
 */
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
        });
        const settingsReporter = reporter.add();
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

    private static _parseWaveFunctionFile(file: File, progressReporter: AggregatingReporter, options?: {headerPrefix?: string}): Promise<[Array<number>, Array<Array<[number, number]>>]|undefined> {
        if (!file)
            return Promise.resolve(undefined);
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
            reader.readAsText(file, "UTF-8");
        });
    }

    private static _parseObservablesFile(file: File, progressReporter: AggregatingReporter): Promise<Array<ExpectationValues>|undefined> {
        if (!file)
            return Promise.resolve(undefined);
        const reporter: ProgressSink = progressReporter.add();
        return new Promise((resolve, reject) => {
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
                    const line0: [Array<string>, number]|null = FileImport._nextRow(result, start, 4);
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
                reporter.isDone();
                resolve(exp);
            };
            reader.onerror = reject;
            reader.onprogress = (event: ProgressEvent<FileReader>) => {
                if (event.lengthComputable) 
                    reporter.progress(event.loaded, event.total);
            };
            reader.readAsText(file, "UTF-8");
        });
    }

    static async parseQmFiles(reporter: AggregatingReporter, id: string, waveFunction: File, observables: File, settings: File,
                psiTilde?: File, observablesQm?: File, potential?: File, classicalResults?: SimulationResultClassical): Promise<SimulationResultQm> {
        try {
            return await FileImport._parseQmFiles0(id, reporter, waveFunction, observables, settings, psiTilde, observablesQm, potential, classicalResults);
        } catch (e) {
            reporter.error(e?.toString());
            throw e;

        /*} finally {
            reporter.isDone();*/
        }
    }

    private static async _parseQmFiles0(id: string, reporter: AggregatingReporter,  waveFunction: File, observables: File, settings: File,
            psiTilde?: File, observablesQm?: File, potential?: File, classicalResults?: SimulationResultClassical): Promise<SimulationResultQm> {
        const waveFunctionPromise: Promise<[Array<number>, Array<Array<[number, number]>>]> = FileImport._parseWaveFunctionFile(waveFunction, reporter);
        const observablesPromise: Promise<Array<ExpectationValues>> = FileImport._parseObservablesFile(observables, reporter);
        const settingsPromise: Promise<QuantumSettings> = new Promise((resolve, reject) => {
            const reader = new FileReader();
            const settingsReporter = reporter.add();
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
        });
        const psiTildePromise: Promise<[Array<number>, Array<Array<[number, number]>>]|undefined> = FileImport._parseWaveFunctionFile(psiTilde, reporter);
        const observablesQmPromise: Promise<Array<ExpectationValues>|undefined> = FileImport._parseObservablesFile(observablesQm, reporter);
        const potentialPromise: Promise<[Array<number>, Array<Array<[number, number]>>]> = FileImport._parseWaveFunctionFile(potential, reporter, {headerPrefix: "V"});
        const result = await Promise.all([waveFunctionPromise, observablesPromise, settingsPromise, psiTildePromise, observablesQmPromise, potentialPromise]);
        const x = result[0][0];
        const psi = result[0][1];
        const observables2 = result[1];
        const settings2: QuantumSettings = result[2];
        let waveFct: Array<QuantumSystem> = psi.map((values: Array<[number, number]>, idx: number) => {
            const observables: ExpectationValues = observables2[idx];
            // TODO here we'd also like to add psiP, if available
            const qmSystem: QuantumSystem = {
                time: idx * settings2.deltaT,
                psi: {...{
                    representation: "x",
                    basePoints: x,
                    values: values,
                }, ...observables}
            };
            return qmSystem;
        });
        if (result[3] && result[4] && classicalResults) {
            const x2 = result[3][0];
            const psiTilde = result[3][1];
            if (psiTilde.length !== classicalResults.timesteps.length 
                    || psiTilde.length !== waveFct.length) {
                const msg = "Incompatible lengths between wave functions and/or trajectory"
                reporter.error(msg);
                throw new Error(msg);
            }
            const obsQm: Array<ExpectationValues> = result[4];
            // outer index: time, inner index: x
            let potential2: Array<Array<number>>|undefined = undefined;
            if (result[5]) {
                // keep only real part
                potential2 = result[5][1].map(timeslice => timeslice.map(complex => complex[0]));
            }
            const waveFctTilde: Array<QuantumSystemResidual> = psiTilde.map((values: Array<[number, number]>, idx: number) => {
                const psiResults = waveFct[idx];
                const observablesPhi: ExpectationValues = obsQm[idx];
                const systemPhi: {phi: WaveFunctionData; phiP?: WaveFunctionData, phiPotential?: Array<number>;} = {   
                    phi: {...{
                        representation: "x",
                        basePoints: x2,
                        values: values
                    }, ...observablesPhi},
                    // TODO phiP
                    phiPotential: potential2 ? potential2[idx] : undefined
                };
                const phaseSpaceResult: ClassicalSystem = classicalResults.timesteps[idx];
                const overallResult: QuantumSystemResidual = {...psiResults, ...systemPhi, ...phaseSpaceResult};
                return overallResult;
            });
            waveFct = waveFctTilde;
        }
        /*
            readonly id: string;
            readonly timesteps: Array<QuantumSystem>;
            readonly x: Array<number>;
            readonly p?: Array<number>;
            readonly settingsQm: QuantumSettings;
        */

        return {
            id: id,
            x: x,
            /* p: ... TODO */
            timesteps: waveFct,
            settingsQm: settings2
        };
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
        this._sink.started();
    }

    progress(done: number, total: number): void {
        this.#done = done;
        this.#total = total;
        this._sink.progress(done, total);
    }

    done(): number {
        if (Number.isFinite(this.#total) && this.#total > 0)
            this.#done = this.#total;
        else {
            this.#done = 1;
            this.#total = 1;
        }
        return this.#done;
    }

    total(): number {
        return this.#total;
    }

    isDone(): void {
        this.#status = "done";
        this._sink.isDone();
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
        const allStarted: boolean = this.#reporters.find(r => r.status() === "inactive") === undefined;
        if (allStarted)
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
        this.#done = this.#reporters.find(r => r.status() !== "done") === undefined;
        if (this.#done)
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
     * Call once to register the new tag type "<phase-space-density></phase-space-density>"
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
        style.textContent = ".upload-dataset { display: flex; column-gap: 1em; margin-bottom: 1em; }";
        this.shadowRoot.appendChild(style); // TODO do we first need to attach a new shadow root?
        const uploadDataset = JsUtils.createElement("div", {classes: ["upload-dataset"], parent: this.shadowRoot});
        JsUtils.createElement("div", {text: "Dataset", parent: uploadDataset});
        this.#datasetIdField = JsUtils.createElement("input", {attributes: new Map([["type", "text"], ["value", "default"], ["placeholder", "Dataset name"]]), 
                id: "uploadDataset", title: "Provide a name for the new dataset", parent: JsUtils.createElement("div", {parent: uploadDataset})});
        const uploadControl = JsUtils.createElement("div", {id: "uploadControl", classes: ["upload-control"],
                parent: this.shadowRoot});
        const fileSelector = JsUtils.createElement("input", {attributes: new Map([["type", "file"], ["value", "Upload"], 
                ["multiple", "multiple"], ["accept", ".csv,.json"]]), 
            id: "fileSelector", title: "Select result files for display", parent: uploadControl});        
        this.#fileSelector = fileSelector;
        const fileUpload = JsUtils.createElement("input", {attributes: new Map([["type", "button"], ["value", "Upload"], 
                ["multiple", "multiple"], ["accept", ".csv,.json"], ["disabled", "disabled"]]),
            id: "fileUpload", title: "Select files first", parent: uploadControl});
        this.#fileUpload = fileUpload;
        const progressOverlay = JsUtils.createElement("div", {classes: ["overlay"], id: "uploadProgress", 
            attributes: new Map([["hidden", "hidden"]]), parent: this.shadowRoot});
        const overlay2 = JsUtils.createElement("div", {parent: progressOverlay});
        JsUtils.createElement("div", {text: "Loading...", parent: overlay2});
        this.#progress = JsUtils.createElement("progress", {parent: overlay2, 
                attributes: new Map([["max", "100"], ["value", "0"]])});                
        this.#progress.value = 0;  // ?
        this.#progressReporter = {
            started() {
                progressOverlay.hidden = false;
            },
            progress(done: number, total: number) {
                const progress: number = total > 0 ? done / total : 0;
                this.#progress.value = progress * 100;
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
        fileUpload.addEventListener("click", () => this._upload.bind(this));
    }   

    connectedCallback() {
        this.#fileSelector.dispatchEvent(new Event("change"));
    }

    private async _upload() {
        if (this.#uploadRunning)
            return;
        const files: Array<File> = Array.from(this.#fileSelector.files)
            .filter(fl => fl.name.toLowerCase().endsWith(".csv") || fl.name.toLowerCase().endsWith(".json"));
        if (files.length === 0)
            return;
        const psi: File|undefined = files.find(fl => fl.name.toLowerCase() === "psi.csv");
        const observables: File|undefined = files.find(fl => fl.name.toLowerCase() === "observables.csv");
        const settings: File|undefined = files.find(fl => fl.name.toLowerCase() === "settings.json");
        const points: File|undefined = files.find(fl => fl.name.toLowerCase() === "points.csv");
        // the three below are present for calculations in the residual rep only, besides all the other files
        const psiTilde: File|undefined = files.find(fl => fl.name.toLowerCase() === "psitilde.csv" || fl.name.toLowerCase() === "phi.csv");
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
            const resultsQm = isQuantum ? await FileImport.parseQmFiles(reporter, id, psi, observables, settings, psiTilde, observablesQm, potential, resultsClassical) : undefined;
            const results = isQuantum && isClassical ? {...resultsQm, classicalTrajectory: resultsClassical} : isQuantum ? resultsQm : resultsClassical;
            // TODO consume the event
            this.dispatchEvent(new CustomEvent<SimulationResult>("upload", {detail: results}));

            //this.#simulationController.addResultSet(results); // TODO
            //hideShowMenu(false); // TODO
        } catch(e) {  // TODO dispatch event as well?
            console.error("Failed to upload results", e);  // TODO show to user
            this.dispatchEvent(new CustomEvent<Error>("error", {detail: new Error("Failed to upload results " + e)}));
        } finally {
            this.#uploadRunning = false;
        }
    }




}
