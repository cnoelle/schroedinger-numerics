struct QmSystemConcat <: AbstractQmSystem
    system::AbstractQmSystem
    mainRepresentation::QmRepresentation
    transitions::AbstractArray{<:Function, 1}  # system -> system
    transitionSteps::AbstractArray{Int, 1}
    currentStep::Int
    function QmSystemConcat(
            system::AbstractQmSystem,
            mainRepresentation::QmRepresentation,
            transitions::AbstractArray{<:Function, 1},
            transitionSteps::AbstractArray{Int, 1},
            currentStep::Int=0)
        return new(system, mainRepresentation, transitions, transitionSteps, currentStep)
    end
end # QmSystemConcat

function propagate(system::QmSystemConcat, timeSteps::Int=1)::QmSystemConcat
    for _ in 1:timeSteps
        step::Int = system.currentStep+1
        local sys::AbstractQmSystem
        if step in system.transitionSteps
            idx::Int = findfirst((tr == step for tr in system.transitionSteps))
            sys = system.transitions[idx](system.system)
        else
            sys = propagate(system.system, 1)
        end # if
        system = QmSystemConcat(sys, system.mainRepresentation, system.transitions, system.transitionSteps, step)
    end # if
    return system
end # p

function getPsi(system::QmSystemConcat) 
    return getPsi(system.system)
end # getPsi

function representation(system::QmSystemConcat)::QmRepresentation
    return system.mainRepresentation
end

function hamiltonian(system::QmSystemConcat)::AbstractObservable
    return hamiltonian(system.system)
end

function hbar(system::QmSystemConcat)::Real
    return hbar(system.system)
end

function deltaT(system::QmSystemConcat)::Real
    return deltaT(system.system)
end

function scheme(system::QmSystemConcat)::NumericsScheme
    return scheme(system.system)
end

export QmSystemConcat
