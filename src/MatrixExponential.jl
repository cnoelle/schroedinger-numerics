"
Integrate the Schrödinger equation by calculating the matrix exponential.
Usage not recommended.
"
struct MatrixExponential <: QmNumericsScheme
end # MatrixExponential

function schemeId(scheme::MatrixExponential)::String
    return "MatrixExponential"
end

struct ExponentialMatrix <: QuantumPropagator
    representation::QmRepresentation
    config::SchroedingerConfig
    deltaT::Real
    raw"-i/2\hbar times the Hamiltonian"
    H::Operator
end # ExponentialMatrix

"""
Find the concrete matrix representation of the Hamiltonian for the selected grid
"""
function incarnate(hamiltonian::AbstractObservable, representation::QmRepresentation, 
        scheme::MatrixExponential, deltaT::Real)::ExponentialMatrix
    config = qmConfig(representation)
    return ExponentialMatrix(representation, config, deltaT,
        (-im/2/config.hbar * asOperator(hamiltonian, representation)))
end # specialize

struct MemoryWaveFunction <: AbstractWaveFunction
    psi0::AbstractWaveFunction
    t0::Real
    psi1::AbstractWaveFunction
    t1::Real
end # MemoryWaveFunction

# apply exponential matrix
# Note: for this scheme it may be advantageous to advance by larger timesteps
function propagateSingleTimestep(psi::AbstractWaveFunction, propagator::MatrixExponential)::MemoryWaveFunction
    if psi isa MemoryWaveFunction
        t1::Real = psi.t1 + propagator.deltaT
        U::Operator = exp(propagator.H * (t1 - psi.t0))
        psi1 = asWavefunction(U * values(psi.psi0, propagator.representation), propagator.representation)
        return MemoryWaveFunction(psi.psi0, psi.t0, psi1, t1)
    end # if
    psi1 = asWavefunction(exp(propagator.H * propagator.deltaT) * values(psi, propagator.representation), propagator.representation)
    return MemoryWaveFunction(psi, 0., psi1, propagator.deltaT)
end # propagateSingleTimestep


function Base.:values(psi::MemoryWaveFunction, repr::QmRepresentation)::AbstractArray{<:Complex, 1}
    return values(psi.psi1, repr)
end # values

function innerProduct(psi::MemoryWaveFunction, phi::MemoryWaveFunction, repr::QmRepresentation)::Number
    return innerProduct(psi.psi1, phi.psi1, repr)
end # innerProduct

export MatrixExponential

