abstract type NumericsScheme
end # 

abstract type QmNumericsScheme <: NumericsScheme
end # 

# concrete representation of the time evolution operator in some integration scheme
abstract type QuantumPropagator
end # QuantumPropagator

function incarnate(hamiltonian::AbstractObservable, representation::QmRepresentation, 
        scheme::QmNumericsScheme, deltaT::Real)::QuantumPropagator
    throw(ErrorException("Not implemented"))
end # incarnate


function propagateSingleTimestep(psi::AbstractWaveFunction, 
        propagator::QuantumPropagator)::AbstractWaveFunction
    throw(ErrorException("Not implemented"))
end # propagateSingleTimestep

### Classical schem below ###

abstract type ClassicalNumericsScheme <: NumericsScheme
end # 

abstract type ClassicalPropagator
end #

function incarnate(hamiltonian::AbstractObservable, 
        scheme::ClassicalNumericsScheme, deltaT::Real)::ClassicalPropagator
    throw(ErrorException("Not implemented"))
end # incarnate


function propagateSingleTimestep(p::AbstractPoint, 
        propagator::ClassicalPropagator)::AbstractPoint
    throw(ErrorException("Not implemented"))
end # propagateSingleTimestep

function schemeId(scheme::NumericsScheme)::String
    throw(ErrorException("Not implemented"))
end


export QmNumericsScheme, QuantumPropagator, incarnate, propagateSingleTimestep, schemeId,
   ClassicalNumericsScheme, ClassicalPropagator
