module SchroedingerNumerics
import LinearAlgebra
import Printf
import JSON
import Base.values

# imports are listed in order of dependencies; lower files may depend on upper files
include("./SchroedingerConfig.jl")
include("./PhaseSpace.jl")
include("./DifferentiationUtils.jl")
include("./PhaseSpaceFunctions.jl")
include("./Representation.jl")
include("./WaveFunction.jl")
include("./NumericsScheme.jl")
include("./ExactTrajectory.jl")
include("./SymplecticEuler.jl")
include("./ExactWaveFunction.jl")
include("./ForwardEulerQm.jl")
include("./MatrixExponential.jl")
include("./CrankNicolson.jl")
include("./WeylTransformedScheme.jl")
include("./ExactQuantumPropagation.jl")
include("./ResidualScheme.jl")
include("./IoUtils.jl")
include("./ClassicalSystem.jl")
include("./QmSystem.jl")
include("./QmSystemResidual.jl")
include("./QmSystemSum.jl")
include("./QmSystemConcat.jl")
include("./IoSystemUtils.jl")


    
end # module
