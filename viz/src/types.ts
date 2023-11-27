export interface QuantumSimulationResult {
    readonly id: string;
    readonly x: Array<number>; // x values
    readonly timesteps: Array<number>;
    readonly waveFunction: Array<Timeslice>;
    // array: timesteps
    readonly observables: Array<ExpectationValues>;
    readonly settings: QuantumSettings;

    // possibly the transformed wave function and classical trajectory
    readonly waveFunctionTilde?: Array<Timeslice>;
    readonly classicalTrajectory?: ClassicalSimulationResult;
    readonly observablesTilde?: Array<ExpectationValues>;
    // outer index: time, inner: x; the effective, time-dependent potential for \tilde \psi
    readonly potential?: Array<Array<number>>;

}

export interface Timeslice {
    readonly x: Array<number>;
    readonly waveFunction: Array<[number, number]>;
    readonly observables: ExpectationValues;
    readonly settings: QuantumSettings;
}

export interface ClassicalSimulationResult {
    readonly id: string;
    readonly timesteps: Array<number>;
    readonly points: Array<Point>;
    readonly settings: ClassicalSettings;
}

export interface Point {
    x: number;
    p: number;
    E?: number; // for classical trajectories the energy may be specified as well
}

export interface ExpectationValues extends Point {
    readonly x2: number;
    readonly p2: number;
    readonly E: number; // the energy
}

export interface Scheme {
    id: string;
}

export type QuantumSettings = {
    readonly type: "qm";
    readonly hbar: number;
    readonly deltaT: number;
    readonly scheme: Scheme;
    readonly deltaX?: number; 
} & Potential;

/**
 * Either the coefficients of a polynomial, V0 + V1*x + 1/2 V2*x^2 + 1/6 V3*x^3 + ...,
 * or the sampled values at specified base points
 */
export interface Potential {
    V_coefficients?: Array<number>;
    points?: Array<number>;  // points and V should always appear together
    V?: Array<number>;
}

export type ClassicalSettings = {
    readonly type: "classical";
    readonly deltaT: number;
    readonly scheme: Scheme;
} & Potential;

export interface SimulationListener {
    initialize(qmResults: Array<QuantumSimulationResult>, classicalResults: Array<ClassicalSimulationResult>): void;
    scale(scale: number): void;
    // slices: first value: psi, second value: psiTilde, if present
    // potential: outer index: dataset idx, inner index: spatial
    next(slices: Array<[Timeslice, Timeslice|undefined]>, poins: Array<Point>, potential?: Array<Array<number>|undefined>): void;
    clear(): void;
}

export enum SimulationState {
    UNSET = "UNSET",
    INITIALIZED = "INITIALIZED",
    RUNNING = "RUNNING",
    PAUSED = "PAUSED",
    DONE = "DONE"
    
}

export interface SimulationStateListener {
    stateChanged: (simulationState: SimulationState) => void;
    onProgress?: (fraction: number) => void;
}

export class TypesUtils {

    private constructor() {}

    private static factorialize(num: number): number {
        if (num === 0)
            return 1;
        let result = num;
        for (let lower = num - 1; lower >= 1; lower--) {
            result = result * lower;
        }
        return result;
    }

    /*
     * TODO we could use MathML here for nicer presentation
     * <math>
        <mfrac>
          <mn>1</mn>
          <msqrt>
            <mn>2</mn>
          </msqrt>
        </mfrac>
      </math>
     */
    public static printPotential(V: Potential): string {
        if (!!V.V_coefficients) {  // polynomial
            let result = "V(x) = ";
            let idx = 0;
            for (let c of V.V_coefficients) {
                if (c != 0) {
                    let hasPrefix = false;
                    if (idx >= 2) {
                        result += c + "/" + TypesUtils.factorialize(idx)
                        hasPrefix = true;
                    } else if (c != 1) {
                        result += c
                        hasPrefix = true;
                    }
                    if (idx === 0)
                        continue;
                    if (hasPrefix)
                        result += "*"
                    result += "x";
                    if (idx >= 2)
                        result += "^" + idx;
                }
                idx++;
            }
            return result;
        }
        if (!!V.points && !!V.V) {  // sampled values
            const values: Array<number> = V.V;
            const points: Array<number> = V.points;
            const l: number = values.length;
            if (l < 10)
                return "{" + values.map((v, idx) => points[idx] + " => " + v).join(", ") + "}"
            const delta = Math.floor(l / 10);
            const indices = [...Array(9).keys()].map(idx => idx * delta);
            indices.push(l-1);
            return "{" + indices.map(idx => points[idx] + " => " + values[idx]).join(", ") + "}"
        }
    }

}
