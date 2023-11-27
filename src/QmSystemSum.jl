struct QmSystemSum <: AbstractQmSystem
    systems::AbstractArray{Union{QmSystem, QmSystemResidual}, 1}
end # QmSystemConcat

function propagate(system::QmSystemSum, timeSteps::Int=1)::QmSystemSum
    return QmSystemSum([propagate(sys, timeSteps) for sys in system.systems])
end # p

function getPsi(system::QmSystemSum) 
    return sum(sys.currentState isa AbstractWaveFunction ? sys.currentState : 
                getPsi(sys.currentState) for sys in system.systems)
end # getPsi

function representation(system::QmSystemSum)::QmRepresentation
    return representation(system.systems[1])
end

function hamiltonian(system::QmSystemSum)::AbstractObservable
    return hamiltonian(system.systems[1])
end

function hbar(system::QmSystemSum)::Real
    return hbar(system.systems[1])
end

function deltaT(system::QmSystemSum)::Real
    return deltaT(system.systems[1])
end

function scheme(system::QmSystemSum)::NumericsScheme
    return scheme(system.systems[1])
end

export QmSystemSum
