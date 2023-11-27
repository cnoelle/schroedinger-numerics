struct ClassicalSystem
    initialState::AbstractPoint
    hamiltonian::AbstractObservable
    propagator::ClassicalPropagator
    scheme::ClassicalNumericsScheme
    deltaT::Real
    # state
    currentTime::Real
    currentState::AbstractPoint
    function ClassicalSystem(point::AbstractPoint, hamiltonian::AbstractObservable, deltaT::Real;
            scheme::ClassicalNumericsScheme=SymplecticEuler(), t0::Real=0.)
        propagator::ClassicalPropagator = incarnate(hamiltonian, scheme, deltaT)
        return new(point, hamiltonian, propagator, scheme, deltaT, t0, point)
    end # ClassicalSystem
    function ClassicalSystem(other::ClassicalSystem, t::Real, point::AbstractPoint)
        return new(other.initialState, other.hamiltonian, other.propagator, 
            other.scheme, other.deltaT, t, point)
    end # ClassicalSystem
end # ClassicalSystem

function scheme(system::ClassicalSystem)::NumericsScheme
    return system.scheme
end

function hamiltonian(system::ClassicalSystem)::AbstractObservable
    return system.hamiltonian
end

function deltaT(system::ClassicalSystem)::Real
    return system.deltaT
end

function propagate(system::ClassicalSystem, timeSteps::Int=1)::ClassicalSystem
    for _ in 1:timeSteps
        point::AbstractPoint = propagateSingleTimestep(system.currentState, system.propagator)
        system = ClassicalSystem(system, system.currentTime + system.deltaT, point)
    end # for k
    return system
end # p

function _writeSettings(system::ClassicalSystem, file::IO)
    indent::String = "    "
    write(file, "{\n")
    write(file, indent, "\"type\": \"classical\",\n")
    write(file, indent, "\"deltaT\": $(system.deltaT),\n")
    write(file, indent, "\"scheme\": $(_schemeToJson(system.scheme))") 
    try
        _writePotentialJson(file, projectX(system.hamiltonian), 
            indent=length(indent), startWithComma=true)
    catch
    end
    write(file, "\n}\n")
end # _writeSettings


function trace(system::ClassicalSystem, timeSteps::Int=1000;
        folder::String = "./results") # io::IO
    Base.Filesystem.mkpath(folder)
    settingsFile::String = joinpath(folder, "settings.json")
    pointsFile::String = joinpath(folder, "points.csv")
    open(settingsFile, "w") do settingsFile1
        _writeSettings(system, settingsFile1)
    end # settingsFile
    V::Any = nothing
    try
        V = projectX(system.hamiltonian) # we expect this to be a function of x
    catch
    end
    open(pointsFile, "w") do fileObservables
        write(fileObservables, "x, p, E\n")
        for _ in 1:timeSteps
            # write expectation values
            point::Point = pin(system.currentState)
            xVal::Real = point.q
            pVal::Real = point.p
            energy::Real = system.hamiltonian(point)
            write(fileObservables, "$(xVal), $(pVal), $(energy)\n")
            system = propagate(system, 1)
        end # for k
    end # open fileObservables
    return system
    
end # trace

export ClassicalSystem
export propagate
export trace

