"Implements the naive Euler integration scheme for the time-dependent Schrödinger equation.
Note that this integration scheme is not stable and leads to extremely unreliable results. 
For testing only, do not use."
struct ForwardEulerQm <: QmNumericsScheme
end # ForwardEulerQm

function schemeId(scheme::ForwardEulerQm)::String
    return "ForwardEulerQm"
end

struct HamiltonianMatrix <: QuantumPropagator
    scheme::ForwardEulerQm
    config::SchroedingerConfig
    representation::QmRepresentation
    propagationMatrix::Operator
end # struct

"Find the concrete matrix representation of the Hamiltonian for the selected grid"
function incarnate(hamiltonian::AbstractObservable, representation::QmRepresentation, 
        scheme::ForwardEulerQm, deltaT::Real)::QuantumPropagator
    config = qmConfig(representation)
    propagator::AbstractArray{<:Complex, 2} = 
        LinearAlgebra.I - (im/config.hbar) * deltaT * asOperator(hamiltonian, representation)
    return HamiltonianMatrix(scheme, config, representation, propagator)
end # specialize

function propagateSingleTimestep(psi::AbstractWaveFunction, propagator::HamiltonianMatrix)::AbstractWaveFunction
    return asWavefunction(propagator.propagationMatrix * values(psi, propagator.representation), propagator.representation)
end # propagateSingleTimestep

export ForwardEulerQm
