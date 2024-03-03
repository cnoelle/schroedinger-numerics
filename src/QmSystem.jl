abstract type AbstractQmSystem
end

struct QmSystem <: AbstractQmSystem
    config::SchroedingerConfig
    initialState::AbstractWaveFunction
    hamiltonian::AbstractObservable
    representation::QmRepresentation
    scheme::QmNumericsScheme
    propagator::QuantumPropagator
    deltaT::Real
    "Whether to normalize the wave function in every step. Usually not required nor recommended."
    doNormalize::Bool
    # state
    currentTime::Real
    currentState::AbstractWaveFunction
    function QmSystem(psi0::AbstractWaveFunction, 
            hamiltonian::AbstractObservable, representation::QmRepresentation,
            deltaT::Real;
            scheme::QmNumericsScheme=CrankNicolson(), 
            doNormalize::Bool = false, t0::Real=0.)
        propagator::QuantumPropagator = incarnate(hamiltonian, representation, scheme, deltaT)
        return new(qmConfig(representation), psi0, hamiltonian, representation, scheme, propagator, deltaT, doNormalize, t0, psi0)
    end # QmSystem
    function QmSystem(other::QmSystem, t::Real, psi::AbstractWaveFunction)
        return new(other.config, other.initialState, other.hamiltonian, other.representation,
            other.scheme, other.propagator, other.deltaT, other.doNormalize, t, psi)
    end # QmSystem
end # QmSystem

function propagate(system::AbstractQmSystem, timeSteps::Int=1)::AbstractQmSystem
    for _ in 1:timeSteps
        newPsi::AbstractWaveFunction =  propagateSingleTimestep(getPsi(system), system.propagator)
        if system isa QmSystem && system.doNormalize
            newPsi = normalize(newPsi, system.representation)
        end # if        
        system = QmSystem(system, system.currentTime + system.deltaT, newPsi)
    end # for k
    return system
end # p

function getPsi(system::QmSystem)::AbstractWaveFunction
    return system.currentState
end # getPsi

function representation(system::QmSystem)::QmRepresentation
    return system.representation
end

function hamiltonian(system::AbstractQmSystem)::AbstractObservable
    return system.hamiltonian
end

function hbar(system::AbstractQmSystem)::Real
    return system.config.hbar
end

function deltaT(system::AbstractQmSystem)::Real
    return system.deltaT
end

function scheme(system::AbstractQmSystem)::NumericsScheme
    return system.scheme
end

function _writeSettingsQm(system::AbstractQmSystem, file::IO; 
        points::Union{AbstractArray{<:Real, 1}, Nothing}=nothing,
        parameters::Union{Dict{String, Any}, Nothing}=nothing)
    indent::String = "    "
    write(file, "{\n")
    write(file, indent, "\"type\": \"quantum\",\n")
    write(file, indent, "\"hbar\": $(hbar(system)),\n")
    write(file, indent, "\"deltaT\": $(deltaT(system)),\n")
    write(file, indent, "\"scheme\": $(_schemeToJson(scheme(system)))")
    if isnothing(points)
        try 
            points = representation(system).points
        catch
        end
    end
    try
        _writePotentialJson(file, projectX(hamiltonian(system)), 
            indent=length(indent), startWithComma=true, points=points)
    catch
    end
    if !isnothing(parameters)
        for (key, value) in parameters
            write(file, ",\n", indent, "\"$(key)\": ")
            isStr::Bool = value isa String
            if isStr
                write(file, "\"")
            end 
            write(file, "$(value)")
            if isStr
                write(file, "\"")
            end 
        end # for
    end # if
    write(file, "\n}\n")
end # _writeSettingsQm

function trace(system::AbstractQmSystem, timeSteps::Int=1000; 
        folder::String = "./results", 
        momentumRepresentation::Union{MomentumRepresentation, Nothing}=nothing,
        parameters::Union{Dict{String, Any}, Nothing}=nothing) # io::IO
    rep::QmRepresentation = representation(system)
    if !(rep isa PositionRepresentation)
        throw(ErrorException("Can only handle position representation, currently")) # XXX
    end # if
    Base.Filesystem.mkpath(folder)
    settingsFile::String = joinpath(folder, "settings.json")
    psiFile::String = joinpath(folder, "psi.csv")
    psiPFile::String = isnothing(momentumRepresentation) ? nothing : joinpath(folder, "psiP.csv")
    observablesFile::String = joinpath(folder, "observables.csv")
    points0::AbstractArray{<:Real, 1} = rep.points
    x = XPolynomial([0., 1.])
    x2 = XPolynomial([0., 0., 1.])
    p = PMonomial(1)
    p2 = PMonomial(2)
    open(settingsFile, "w") do settingsFile1
        _writeSettingsQm(system, settingsFile1, parameters=parameters)
    end # settingsFile
    open(psiFile, "w") do file
    open(observablesFile, "w") do fileObservables
    if !isnothing(psiPFile)
        fileP = open(psiPFile, "w")
        _writePointsHeader(fileP, momentumRepresentation.points)
    end
        _writePointsHeader(file, points0)
        _writeObservablesHeader(fileObservables)
        for _ in 1:timeSteps
            psi = getPsi(system)
            # write wave function values
            _writePointsLine(file, psi, rep)
            # write expectation values
            xVal::Real = expectationValue(psi, x, rep)
            x2Val::Real = expectationValue(psi, x2, rep)
            pVal::Real = expectationValue(psi, p, rep)
            p2Val::Real = expectationValue(psi, p2, rep)
            energy::Real = expectationValue(psi, hamiltonian(system), rep)
            # Note: var(X) = x2Val - xVal^2
            _writeObservablesLine(fileObservables, xVal, x2Val, pVal, p2Val, energy)
            if !isnothing(psiPFile)
                _writePointsLine(fileP, psi, momentumRepresentation)
            end
            system = propagate(system, 1)
        end # for k
    if !isnothing(psiPFile)
        close(fileP)
    end
    end # open fileObservables
    end # open file
    return system
    
end # trace

export AbstractQmSystem, QmSystem, propagate, trace, representation, getPsi
