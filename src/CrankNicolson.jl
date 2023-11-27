raw"Implements the Crank-Nicolson integration scheme for the Schrödinger equation, i.e.
(1+i/(2\hbar) \hat H) \psi(t+1) = (1-i/(2\hbar) \hat H)\psi(t) "
struct CrankNicolson <: QmNumericsScheme
end # CrankNicolson

function schemeId(::CrankNicolson)::String
    return "CrankNicolson"
end

struct CNMatrix <: QuantumPropagator
    representation::QmRepresentation
    config::SchroedingerConfig
    raw"(1+i*deltaT/(2\hbar) \hat H)"
    A::AbstractArray{<:Complex, 2}
    raw"(1-i*deltaT/(2\hbar) \hat H)"
    B::AbstractArray{<:Complex, 2}
    raw"The time evolution matrix (1+i/(2\hbar) \hat H)^(-1) * (1-i/(2\hbar) \hat H)"
    AinvB::Union{AbstractArray{<:Complex, 2}, Nothing}
end # CNMatrix

"""
Find the concrete matrix representation of the Hamiltonian for the selected grid
"""
function incarnate(hamiltonian::AbstractObservable, representation::QmRepresentation, 
        scheme::CrankNicolson, deltaT::Real, invertMatrix::Bool=false)::QuantumPropagator
    cfg = qmConfig(representation)
    H = asOperator(hamiltonian, representation)
    hbar = cfg.hbar
    A = (LinearAlgebra.I + (im*deltaT/2/hbar) * H)
    B = (LinearAlgebra.I - (im*deltaT/2/hbar) * H)
    AinvB = invertMatrix ? LinearAlgebra.inv(A) * B : nothing
    return CNMatrix(representation, cfg, A, B, AinvB)
end # incarnate


function propagateSingleTimestep(psi::AbstractWaveFunction, propagator::CNMatrix)::AbstractWaveFunction
    valuesOld::AbstractArray{<:Complex, 1} = values(psi, propagator.representation)
    valuesNew::AbstractArray{<:Complex, 1} = isnothing(propagator.AinvB) ? propagator.A\(propagator.B * valuesOld) : propagator.AinvB * valuesOld
    return asWavefunction(valuesNew, propagator.representation)
end # propagateSingleTimestep

export CrankNicolson
