import { ColorRgba } from "./Color.js";

export interface PhaseSpacePoint {
    readonly x: number;
    readonly p: number;
    readonly E?: number;
}

export interface ExpectationValues extends PhaseSpacePoint {
    readonly x2: number;
    readonly p2: number;
    readonly E: number;
}

export interface WaveFunction {
    readonly representation: "x"|"p";
    /**
     * Position or momentum variable
     */
    readonly basePoints: Array<number>;
    /**
     * real and complex part of the wave function
     */
    readonly values: Array<[number, number]>;
}

export type WaveFunctionData = WaveFunction&Partial<ExpectationValues>;

export interface ClassicalSystem {
    readonly time: number;
    readonly point: PhaseSpacePoint;
}

export interface QuantumSystem {
    readonly time: number;
    readonly psi: WaveFunctionData;
    readonly psiP?: WaveFunctionData;
}

export interface QuantumSystemResidual extends QuantumSystem, ClassicalSystem {
    readonly phi: WaveFunctionData;
    readonly phiP?: WaveFunctionData;

    /**
     * the time-dependent effective potential for \phi
     */
    readonly phiPotential?: Array<number>;
}

export interface Coordinates {
    readonly x: Array<number>;
    readonly p?: Array<number>;
}


export type SimulationSystem = 
    ClassicalSystem
   |QuantumSystem/*&{psiCoordinates: Coordinates}*/
   |QuantumSystemResidual/*&{psiCoordinates: Coordinates; phiCoordinates: Coordinates}*/;

export interface SimulationResultClassical {
    readonly id: string;
    readonly timesteps: Array<ClassicalSystem>;
    readonly settingsClassical: ClassicalSettings;
}

export interface SimulationResultQm {
    readonly id: string;
    readonly timesteps: Array<QuantumSystem>;
    readonly x: Array<number>;
    readonly p?: Array<number>;

    readonly settingsQm: QuantumSettings;
    /**
     * the time-independent potential for \psi  // XXX?
     */
    //readonly psiPotential?: Array<number>;
}

export interface SimulationResultQmResidual extends SimulationResultQm, SimulationResultClassical {
    readonly id: string;
    readonly timesteps: Array<QuantumSystemResidual>;
    readonly xPhi: Array<number>;
    readonly pPhi?: Array<number>;
    // TODO effective potential
}

export type SimulationResult = SimulationResultClassical|SimulationResultQm|SimulationResultQmResidual;

export function simulationSettings(result: SimulationResult): SimulationSettings {
    return (result as SimulationResultQm).settingsQm ? (result as SimulationResultQm).settingsQm 
        :  (result as SimulationResultClassical).settingsClassical;
}

/**
 * Either the coefficients of a polynomial, V0 + V1*x + 1/2 V2*x^2 + 1/6 V3*x^3 + ...,
 * or the sampled values at specified base points
 */
export interface Potential {
    readonly potentialValueRange: [number, number];
    readonly V_coefficients?: Array<number>;
    readonly points?: Array<number>;  // points and V should always appear together
    readonly V?: Array<number>;
}

export interface Scheme {
    readonly id: string;
}

export interface SimulationSettings {
    readonly type: "qm"|"classical";
    readonly deltaT: number;
    readonly scheme: Scheme;
}

export type QuantumSettings = SimulationSettings & {
    readonly type: "qm";
    readonly hbar: number;
    readonly deltaX?: number; 
} & Potential;

export type ClassicalSettings = SimulationSettings & {
    readonly type: "classical";
} & Potential;

/**
 * RGBA format
 */
export type Color = [number, number, number, number];

export interface VisualizationSettings {
    id: string;
    color: ColorRgba;
}

export type SimulationParameters = (QuantumSettings|ClassicalSettings)&VisualizationSettings;

export interface QmWidget {
    initialize(settings: Array<SimulationParameters>): void;  // TODO further parameters?
    clear(): void;
    set(state: Array<SimulationSystem>): void;
}

export enum SimulationState {
    UNSET = "UNSET",
    INITIALIZED = "INITIALIZED",
    RUNNING = "RUNNING",
    PAUSED = "PAUSED",
    DONE = "DONE"    
}

export type SimulationStateChange = "start"|"stop"|"pause"|"reset"|"stepForward"|"stepBackward";

/**
 * Fired with type: "reset"
 */
export interface SimulationStateReset {
    fraction: number;
}

/**
 * Fired with type "durationChange"
 */
export interface SimulationDurationChange {
    seconds: number;
}

export interface SimulationStateListener {
    stateChanged: (simulationState: SimulationState) => void;
    onProgress?: (fraction: number) => void;
}



