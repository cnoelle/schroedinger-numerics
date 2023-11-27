# TODO need to write more scheme parameters?
function _writeCommon(system::Union{ClassicalSystem, AbstractQmSystem}, 
        file::IO; points::Union{AbstractArray{<:Real, 1}, Nothing}=nothing,
        indent::Int=4)
    indentation = repeat(" ", indent)
    write(file, "{\n")
    type = system isa QmSystemResidual ? "qmResidual" : 
        system isa AbstractQmSystem ? "qm" : "classical"
    write(file, indentation, "\"type\": \"$(type)\",\n")
    write(file, indentation, "\"scheme\": $(_schemeToJson(scheme(system))),")
    _writePotentialJson(file, projectX(hamiltonian(system)), 
        points=points, indent=indent)
    mass::Real = 1/2/hamiltonian(system)(Point(0, 1))
    write(file, ",\n", indentation, "\"mass\": $(mass),\n")
    write(file, indentation, "\"deltaT\": $(deltaT(system)),\n")
    if hasproperty(system, :currentTime)
        write(file, indentation, "\"t\": $(system.currentTime),\n")
    end
end # _writeCommon

"points may only be nothing for polynomial potentials or sampled x functions"
function store(system::ClassicalSystem, file::IO; 
        points::Union{AbstractArray{<:Real, 1}, Nothing}=nothing, indent::Int=4)
    indentation = repeat(" ", indent)
    _writeCommon(system, file, points=points, indent=indent)
    p::Point = pin(system.currentState)
    write(file, indentation, "\"point\": [$(p.q),$(p.p)]\n")
    write(file, "}")
end 

function store(system::AbstractQmSystem, file::IO; 
        points::Union{AbstractArray{<:Real, 1}, Nothing}=nothing, indent::Int=4)
    indentation = repeat(" ", indent)
    rep = representation(system)
    if isnothing(points)
        points = rep isa PositionRepresentation ? rep.points : nothing
    end
    _writeCommon(system, file, points=points, indent=indent)
    write(file, indentation, "\"config\": ", _configToJson(system.config),",\n")
    write(file, indentation, "\"representation\": ")
    _writeRepresentationJson(rep, file)
    write(file, ",\n", indentation, "\"psi\": ")
    _writeWaveFunctionJson(getPsi(system), rep, file, indent=indent)
    if hasproperty(system, :doNormalize)
        write(file, ",\n")
        write(file, indentation, "\"doNormalize\": $(system.doNormalize)\n")
    else
        write(file, "\n")
    end
    write(file, "}")
end 


function store(system::QmSystemResidual, file::IO; 
        points::Union{AbstractArray{<:Real, 1}, Nothing}=nothing, indent::Int=4)
    indentation = repeat(" ", indent)
    rep::QmRepresentation = system.propagator.representation
    if isnothing(points)
        points = rep isa PositionRepresentation ? rep.points : nothing
    end
    _writeCommon(system, file, points=points, indent=indent)
    write(file, indentation, "\"config\": ", _configToJson(system.config),",\n")
    write(file, indentation, "\"representation\": ")
    _writeRepresentationJson(rep, file)
    if !isnothing(system.psiRepresentation)
        write(file, ",\n", indentation, "\"psiRepresentation\": ")
        _writeRepresentationJson(system.psiRepresentation, file)
    end # if
    state::CombinedState = system.currentState
    write(file, ",\n", indentation, "\"t\": $(state.t),\n")
    p::Point = pin(state.point)
    write(file, indentation, "\"point\": [$(p.q),$(p.p)],\n")
    if !isnothing(state.cDot)
        write(file, indentation, "\"cDot\": [$(state.cDot.q),$(state.cDot.p)],\n")
    end # if
    write(file, indentation, "\"Phi\": ")
    _writeWaveFunctionJson(state.Phi, rep, file, indent=indent)
    write(file, ",")
    _writePotentialJson(file, state.V, points=points, indent=indent, id="V_t")
    write(file, "\n}")
end 

function store(system::Union{ClassicalSystem, AbstractQmSystem}, file::String; 
        points::Union{AbstractArray{<:Real, 1}, Nothing}=nothing, indent::Int=4)
    Base.Filesystem.mkpath(Base.Filesystem.dirname(file))
    open(file, "w") do systemFile
        store(system, systemFile, points=points, indent=indent)
    end # systemFile
end

function loadSystem(file::IO)::Union{ClassicalSystem, AbstractQmSystem}
    dict::Dict{String, Any} = JSON.parse(file)
    type::String = dict["type"]
    schemeDict::Dict{String, Any} = dict["scheme"]
    schemeId = Symbol(schemeDict["id"])
    mass::Real = dict["mass"]
    local V::AbstractXFunction
    if haskey(dict, "V_coefficients")
        coeff::AbstractArray{Float64, 1} = convert(AbstractArray{Float64, 1}, dict["V_coefficients"])
        V = XPolynomial(coeff)
    else
        values::AbstractArray{Float64, 1} = convert(AbstractArray{Float64, 1}, dict["V"])
        points::AbstractArray{Float64, 1} = convert(AbstractArray{Float64, 1}, dict["points"])
        V = SampledXFunction(points, values)
    end #if
    hamiltonian = PMonomial(2)/(2*mass) + V
    deltaT = dict["deltaT"]
    config::Union{Nothing, SchroedingerConfig} = haskey(dict, "config") ? _configFromJson(dict["config"]) : nothing
    scheme::NumericsScheme = loadScheme(NumericsSchemeId{schemeId}(), schemeDict)
    t0::Real = dict["t"]
    if type == "classical"
        # lists parsed by JSON are of type Any
        point0::AbstractArray{Any, 1} = dict["point"]
        point::Point = Point(Real(point0[1]), Real(point0[2]))
        system = ClassicalSystem(point, hamiltonian, deltaT, scheme=scheme, t0=t0)
        return system
    elseif type == "qm"
        rep::QmRepresentation = _parseRepresentationJson(dict["representation"], config)
        psi0::AbstractWaveFunction = _parseWavefunctionJson(dict["psi"], rep)
        doNormalize::Bool = haskey(dict, "doNormalize") && dict["doNormalize"]
        system = QmSystem(psi0, hamiltonian, rep, deltaT, scheme=scheme, t0=t0, doNormalize=doNormalize)
        return system
    elseif type == "qmResidual"
        rep2::QmRepresentation = _parseRepresentationJson(dict["representation"], config)
        Phi::AbstractWaveFunction = _parseWavefunctionJson(dict["Phi"], rep2)
        point2::AbstractArray{Any, 1} = dict["point"]
        startingPoint::Point = Point(Real(point2[1]), Real(point2[2]))
        psiRepresentation::Union{Nothing, QmRepresentation} = 
            haskey(dict, "psiRepresentation") ? _parseRepresentationJson(dict["psiRepresentation"], config) : nothing        
        system = QmSystemResidual(startingPoint, Phi, hamiltonian, rep2, deltaT, 
            scheme=scheme, psiRepresentation=psiRepresentation, t0=t0)
        return system
    else
        throw(error("Unsupported system type $(type)"))
    end 
end

function loadSystem(file::String)::Union{ClassicalSystem, AbstractQmSystem}
    open(file, "r") do systemFile
        return loadSystem(systemFile)
    end # systemFile
end # loadSystem

export loadSystem, store
