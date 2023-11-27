"Get the next value of an exactly known wave function"
struct ExactPropagation <: QmNumericsScheme
end # ExactPropagation

function schemeId(::ExactPropagation)::String
    return "ExactQmPropagation"
end

struct ExactPropagator <: QuantumPropagator
    deltaT::Real
end # ExactPropagator

function incarnate(hamiltonian::AbstractObservable, representation::QmRepresentation, 
        scheme::ExactPropagation, deltaT::Real)::QuantumPropagator
    return ExactPropagator(deltaT)
end #specialize

# propagate time step (qm)
function propagateSingleTimestep(psi::ExactWaveFunction, propagator::ExactPropagator)::ExactWaveFunction
    return ExactWaveFunction(psi.f, psi.timestamp + propagator.deltaT)
end # propagateSingleTimestep

function propagateSingleTimestep(psi::ExactSampledWaveFunction, propagator::ExactPropagator)::ExactSampledWaveFunction
    return ExactSampledWaveFunction(psi.psi0, psi.f, psi.timestamp + propagator.deltaT)
end # propagateSingleTimestep

function propagateSingleTimestep(psi::TranslatedExactWaveFunction, propagator::ExactPropagator)::TranslatedExactWaveFunction
    return TranslatedExactWaveFunction(psi.trajectory, propagateSingleTimestep(psi.psi, propagator), psi.hbar)
end # propagateSingleTimestep

export ExactPropagation
