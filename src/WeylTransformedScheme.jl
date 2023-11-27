"""
Solve the Schrödinger equation over a fixed point (q0, p0) in phase space.
For (q0,p0) = (0,0) this is the standard Schrödinger equation
"""
struct WeylTransformedScheme <: QmNumericsScheme
    point::Point
end # WeylTransformedScheme

function schemeId(::WeylTransformedScheme)::String
    return "WeylTransformedScheme"
end

struct CNMatrixWeyl <: QuantumPropagator
    point::Point
    hbar::Real
    representation::QmRepresentation
    config::SchroedingerConfig
    raw"(1+i*deltaT/(2\hbar) \tilde H)"
    A::AbstractArray{<:Complex, 2}
    raw"(1-i*deltaT/(2\hbar) \tilde H)"
    B::AbstractArray{<:Complex, 2}
end # CNMatrixWeyl

function incarnate(
        hamiltonian::AbstractObservable, 
        representation::QmRepresentation, 
        scheme::WeylTransformedScheme, 
        deltaT::Real)::QuantumPropagator
    cfg = qmConfig(representation)
    H = asTildeOperator(hamiltonian, scheme.point, representation)
    hbar = cfg.hbar
    A = (LinearAlgebra.I + (im*deltaT/2/hbar) * H)
    B = (LinearAlgebra.I - (im*deltaT/2/hbar) * H)
    return CNMatrixWeyl(scheme.point, cfg.hbar, representation, cfg, A, B)
end # incarnate


function propagateSingleTimestep(psi::AbstractWaveFunction, propagator::CNMatrixWeyl)::AbstractWaveFunction
    translated::AbstractWaveFunction = weylTranslate(psi, propagator.point, propagator.hbar)
    valuesOld::AbstractArray{<:Complex, 1} = values(translated, propagator.representation)
    valuesNew::AbstractArray{<:Complex, 1} = propagator.A\(propagator.B * valuesOld)
    return weylTranslate(asWavefunction(valuesNew, propagator.representation), -propagator.point, propagator.hbar)
end # propagateSingleTimestep

export WeylTransformedScheme, propagateSingleTimestep
