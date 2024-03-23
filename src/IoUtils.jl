struct BinarySettings
    minValue::Real
    maxValue::Real
    diff::Real
    function BinarySettings(minValue::Real, maxValue::Real)
        return new(minValue, maxValue, maxValue-minValue)
    end # constructor
end # BinarySettings


function _schemeToJson(scheme::NumericsScheme)::String
    return "{\"id\": \"$(schemeId(scheme))\" $(_serializeScheme(scheme))}"
end

function _serializeScheme(::NumericsScheme)::String
    return ""
end

function _serializeScheme(scheme::SymplecticEuler)::String
    return ", \"mass\": $(scheme.mass), \"deltaX\": $(scheme.deltaX)"
end
function _serializeScheme(scheme::ResidualCrankNicolson)::String
    return ", \"isTrajectoryHamiltonian\": $(scheme.isTrajectoryHamiltonian), " *
        "\"classicalScheme\": $(_schemeToJson(scheme.classicalScheme))" 
end

struct NumericsSchemeId{T} end

function loadScheme(::NumericsSchemeId{:SymplecticEuler}, dict::Dict{String, Any})
    return SymplecticEuler(mass=dict["mass"], deltaX=dict["deltaX"])
end

function loadScheme(::NumericsSchemeId{:CrankNicolson}, dict::Dict{String, Any})
    return CrankNicolson()
end

# With the current conventions this is not possible since we cannot 
# serialize/deserialize arbitrary Julia functions...
#function loadScheme(::NumericsSchemeId{:ExactTrajectory}, dict::Dict{String, Any})
#    return ExactTrajectory(func=...)
#end

function loadScheme(::NumericsSchemeId{:ResidualCrankNicolson}, dict::Dict{String, Any})
    isTrajectoryHamiltonian::Bool=dict["isTrajectoryHamiltonian"]
    classicalDict::Dict{String, Any} = dict["classicalScheme"]
    classicalScheme::ClassicalNumericsScheme = loadScheme(NumericsSchemeId{Symbol(classicalDict["id"])}(), classicalDict)
    return ResidualCrankNicolson(isTrajectoryHamiltonian=isTrajectoryHamiltonian,
            classicalScheme=classicalScheme)
end

"points may only be nothing for polynomial potentials or sampled x functions"
function _writePotentialJson(file::IO, V::Union{AbstractXFunction, Operator};
        points::Union{AbstractArray{<:Real, 1}, Nothing}=nothing, 
        indent::Int=4, id::String="V", startWithComma::Bool=false)
    indentation = repeat(" ", indent)
    writeCoefficients::Bool = V isa XPolynomial
    if writeCoefficients
        valuesCoefficients::String = join(V.coefficients, ",")
        if startWithComma
            write(file, ",")
        end
        write(file, "\n", indentation, "\"", id, "_coefficients\": [$(valuesCoefficients)]")
    end #if
    local V_Values::AbstractArray{<:Real, 1} 
    if isnothing(points)
        if V isa SampledXFunction
            V_Values = V.values    
            points = V.points
        else
            #throw(ErrorException("Must specify points to store non-polynomial potential"))
            return
        end # if
    else
        if V isa LinearAlgebra.Diagonal
            V_Values = V.diag
        elseif V isa LinearAlgebra.UniformScaling
            V_Values = fill(V.λ, length(points))
        elseif V isa AbstractArray{<:Real, 2}
            V_Values = [V[idx, idx] for idx in 1:length(points)]
        else
            V_Values = map(x -> V(x), points)
        end # if
    end # if
    if writeCoefficients || startWithComma
        write(file, ",")
    end # if
    valuesString::String = join(V_Values, ",")
    write(file, "\n", indentation, "\"", id,"\": [$(valuesString)],\n")
    pointsString::String = join(points, ",")
    write(file, indentation, "\"points\": [$(pointsString)]")
end

function _loadPotential(dict::Dict{String, Any})::AbstractXFunction
    if haskey(dict, "V_coefficients")
        coeff::AbstractArray{<:Real, 1} = dict["V_coefficients"]
        return XPolynomial(coeff)
    else
        points::AbstractArray{<:Real, 1} = dict["points"]
        values::AbstractArray{<:Real, 1} = dict["V"]
        return SampledXFunction(points, values)
    end #if
end #_loadPotential

function _writeComplexBinary(val::Complex, file::IO, binarySettings::BinarySettings)
    r::Real = (real(val) - binarySettings.minValue)/binarySettings.diff
    i::Real = (imag(val) - binarySettings.minValue)/binarySettings.diff
    rb = convert(UInt8, floor(r * 255))
    ib = convert(UInt8, floor(i * 255))
    write(file, rb)
    write(file, ib)
end # writeComplexBinary

function _writeComplex(val::Complex, file::IO) 
    r::Real = real(val)
    i::Real = imag(val)
    if r == 0.
        write(file, "0.0")
    else
        write(file, "$(Printf.@sprintf("%.4g", r))")
    end # if
    if i == 0.
        write(file, " + 0.0i")
    else
        sgn::String = i >= 0. ? "+" : "-"
        v::Real = abs(i)
        write(file, " $(sgn) $(Printf.@sprintf("%.4gi", v))")
    end # if
end # writeValue

function _writePointsHeader(file::IO, points0::AbstractArray{<:Real, 1}, symbol::Union{String, Nothing} = nothing,
        binary::Bool=false)
    start::Bool = true
    symbol = isnothing(symbol) ? "Psi" : symbol
    if binary
        write(file, "schroedinger")   # magic number # 12 chars, 12 bytes
        write(file, symbol)  # string 
        write(file, convert(UInt8, 0)) # null terminated
        write(file, "x")     # or "p"?  # 1 char, 1 byte
        write(file, convert(Int64, length(points0))) # length, 8 bytes
    end #if
    
    for point in points0
        if !start && !binary
            write(file, ",")
        else
            start=false
        end # 
        if binary
            # TODO
            pf = convert(Float64, point)
            write(file, pf)  # always write as Float64, to ensure nothing gets lost
        else
            write(file, "$(symbol)($(Printf.@sprintf("%.4g", point)))")
        end # if
    end # for point
    if !binary   # else?
        write(file, "\n")
    end
end # _writePointsHeader

function _writeObservablesHeader(file::IO)
    write(file, "x, x^2, p, p^2, E\n")
end # _writeObservablesHeader

function _writePointsLine(file::IO, waveFunction::AbstractWaveFunction, representation::QmRepresentation,
        isBinary::Bool=false)
    start::Bool = true
    vals::AbstractArray{<:Complex} = values(waveFunction, representation)
    binarySettings::Union{BinarySettings, Nothing}=nothing
    if isBinary
        reals = map(v -> real(v), vals)
        imags = map(v -> imag(v), vals)
        rMin = minimum(reals)
        rMax = maximum(reals)
        iMin = minimum(imags)
        iMax = maximum(imags)
        min0 = convert(Float64, minimum([rMin, iMin]))
        max0 = convert(Float64, maximum([rMax, iMax]))
        binarySettings = BinarySettings(min0, max0)
        # in each row, we start with the min max values as Float64
        write(file, min0)
        write(file, max0)
    end
    # TODO normalize?
    for value in vals
        if !start && !isBinary
            write(file, ",")
        else
            start=false
        end # 
        #write(file, replace("$(Printf.@sprintf("%.2f", value))", "im" => "i"))
        if isBinary
            _writeComplexBinary(value, file, binarySettings)
        else
            _writeComplex(value, file)
        end # if
    end # for real
    if !isBinary
        write(file, "\n")
    end
end # _writePointsLine

function _writePotentialLine(file::IO, values0::AbstractArray{<:Real, 1})
    start::Bool = true
    # TODO normalize?
    for value in values0
        if !start
            write(file, ",")
        else
            start=false
        end # 
        write(file, "$(Printf.@sprintf("%.4g", value))")
    end # for real
    write(file, "\n")
end # _writePotentialLine

function _writeObservablesLine(file::IO,
        xVal::Real, x2Val::Real, pVal::Real, p2Val::Real, energy::Real)
    write(file, "$(xVal), $(x2Val), $(pVal), $(p2Val), $(energy)\n")
end # _writeObservablesLine

"write csv file"
function writeWavefunction(psi::AbstractWaveFunction, rep::QmRepresentation;
        fileOrFolder::String="results", hamiltonian::Union{AbstractObservable, Nothing}=nothing)
    local points::AbstractArray{<:Real, 1}
    local delX::Real
    if rep isa PositionRepresentation
        points = rep.points
        delX = deltaX(rep)
    else
        points = 1:length(values(psi, rep))
        delX = 1.
    end # if
    isFile::Bool = endswith(lowercase(fileOrFolder), ".csv")
    psiFile::String = isFile ? fileOrFolder : fileOrFolder * "/psi.csv"
    open(psiFile, "w") do file
        _writePointsHeader(points, file)
        _writePointsLine(psi, rep, file)
    end # open
    if isFile
        return
    end # if
    open(fileOrFolder * "/settings.json", "w") do file
        indent::String = "    "
        write(file, "{\n")
        write(file, indent, "\"type\": \"quantum\",\n")
        write(file, indent, "\"hbar\": $(config.hbar),\n")
        write(file, indent, "\"deltaX\": $(delX)\n")
        write(file, "}\n")
    end # open
    open(fileOrFolder * "/observables.csv", "w") do file
        write(file, "x, x^2, p, p^2")
        if !isnothing(hamiltonian)
            write(file, ", E")
        end # if
        xVal::Real = expectationValue(psi, XPolynomial([0., 1.]), rep)
        x2Val::Real = expectationValue(psi, XPolynomial([0., 0., 1.]), rep)
        pVal::Real = expectationValue(psi, PMonomial(1), rep)
        p2Val::Real = expectationValue(psi, PMonomial(2), rep)
        write(file, "\n$(xVal), $(x2Val), $(pVal), $(p2Val)")
        if !isnothing(hamiltonian)
            energy::Real = expectationValue(psi, hamiltonian, rep)
            write(file, ", $(energy)")
        end # if
        write(file, "\n")
    end # open
end # writeWavefunction

"write csv file"
function _writeWaveFunctionJson(psi::AbstractWaveFunction, rep::QmRepresentation, 
        file::IO; indent::Int=4)
    indentation = repeat(" ", 2*indent)
    local points::AbstractArray{<:Real, 1}
    local vals::AbstractArray{<:Complex, 1}
    if psi isa PointsWaveFunction
        points = psi.points
        vals = psi.values
    else
        vals = values(psi, rep)
        points = rep.points  # XXX 
    end # if
    pointsStr = join(points, ",")
    valuesRealStr = join(map(v->real(v), vals), ",")
    valuesImgStr = join(map(v->imag(v), vals), ",")
    # TODO information about the representation?
    write(file, "{\n", indentation, "\"points\": [$(pointsStr)],\n",
        indentation, "\"real\": [$(valuesRealStr)],\n", indentation, 
        "\"imaginary\": [$(valuesImgStr)]\n", repeat(" ", indent), "}")
end # writeWavefunction

function _configToJson(config::SchroedingerConfig)::String
    return "{\"hbar\": $(config.hbar), \"includeIntegralFactor\": $(config.includeIntegralFactor), " *
        "\"firstDerivativeMethod\": $(config.firstDerivativeMethod), \"limitDiffOrder\":$(config.limitDiffOrder)}"
end # _configToJson

function _configFromJson(config::Dict{String, Any})::SchroedingerConfig
    return SchroedingerConfig(hbar=config["hbar"], includeIntegralFactor=config["includeIntegralFactor"],
        firstDerivativeMethod=config["firstDerivativeMethod"], limitDiffOrder=config["limitDiffOrder"])
end # _configFromJson

function _writeRepresentationJson(rep::PositionRepresentation, file::IO)
    write(file, "{\"type\": \"PositionRepresentation\", \"points\": ")
    points = rep.points
    if points isa AbstractRange        
        write(file, "{\"first\": $(first(points)), \"step\": $(step(points)), \"last\": $(last(points))}")
    else
        write(file, "[", join(points, ","), "]")
    end
    write(file, "}")
end

struct RepresentationId{T} end

# Note: the reason for using the symbol approach is that other modules can thus implement
# their own version for other types of representations 
function loadRepresentationJson(::RepresentationId{:PositionRepresentation}, 
            rep::Dict{String, Any}, config::SchroedingerConfig)::QmRepresentation
    points::Union{Dict{String, Any}, AbstractArray{Any, 1}} = rep["points"]
    local pointsArr::AbstractArray{<:Real, 1}
    if points isa Dict
        step::Real = points["step"]
        first::Real = points["first"]
        last::Real = points["last"]
        pointsArr = first:step:last
    else
        # TODO allow for other number types, e.g. Float32 or Int?
        pointsArr = convert(AbstractArray{Float64, 1}, points)
    end # if
    return PositionRepresentation(pointsArr, config)
end # _parseRepresentationJson

function _parseRepresentationJson(rep::Dict{String, Any}, config::SchroedingerConfig)::QmRepresentation
    type::String = rep["type"]
    return loadRepresentationJson(RepresentationId{Symbol(type)}(), rep, config)
end # _parseRepresentationJson

function _parseWavefunctionJson(psi::Dict{String,Any}, ::PositionRepresentation)::AbstractWaveFunction
    # TODO other number types
    pointsArr = convert(AbstractArray{Float64, 1}, psi["points"])
    realArr = convert(AbstractArray{Float64, 1}, psi["real"])
    imagArr = convert(AbstractArray{Float64, 1}, psi["imaginary"])
    if length(pointsArr) != length(realArr) || length(realArr) != length(imagArr)
        raise(error("The base points (domain), real and imaginary values of a wave function " *
            "must be arrays of the same length, got $(length(pointsArr)), $(length(realArr)), $(length(imagArr))"))
    end # if
    return PointsWaveFunction(pointsArr, realArr + im * imagArr)
end # _parseWavefunctionJson

export writeWavefunction