##### Abstract types and functions below #####

abstract type AbstractWaveFunction
end # AbstractWaveFunction

function Base.:values(psi::AbstractWaveFunction, representation::QmRepresentation)::AbstractArray{<:Complex, 1}
    throw(ErrorException("Not implemented"))
end # values

# called "dot" in LinearAlgebra
function innerProduct(psi::AbstractWaveFunction, phi::AbstractWaveFunction, representation::QmRepresentation)::Number
    throw(ErrorException("Not implemented"))
end # innerProduct

# Named like the corresponding Base function
function norm_sqr(psi::AbstractWaveFunction, representation::QmRepresentation)::Real
    return real(innerProduct(psi, psi, representation))
end # norm_sqr

function normalize(psi::AbstractWaveFunction, representation::QmRepresentation)::AbstractWaveFunction
    return 1/sqrt(norm_sqr(psi, representation)) * psi
end # normalize

"The inverse function of values(psi, representation)"
function asWavefunction(values::AbstractArray{<:Number, 1}, representation::QmRepresentation; cacheNorm::Bool = true)::AbstractWaveFunction
    throw(ErrorException("Not implemented"))
end 

function expectationValue(psi::AbstractWaveFunction, f::AbstractObservable, representation::QmRepresentation; normalize::Bool=true)::Real
    config::SchroedingerConfig = qmConfig(representation)
    result::Real = real(innerProduct(psi, asWavefunction(
            asOperator(f, representation) * values(psi, representation), representation, cacheNorm=false
        ), representation))
    return normalize ? (result / norm_sqr(psi, representation)) : result
end # expectationValue

function expectationValue(psi::AbstractWaveFunction, fHat::Operator, representation::QmRepresentation; normalize::Bool=true)::Real
    result::Real = real(innerProduct(psi, asWavefunction(fHat * values(psi, representation), representation, cacheNorm=false), representation))
    return normalize ? (result / norm_sqr(psi, representation)) : result
end # expectationValue


#### Concrete types and function implementations below #########

function _norm_sqr(points::AbstractArray{<:Real, 1}, values::AbstractArray{<:Number, 1})
    l::Int = length(values)
    if length(points) !== l
        throw(ErrorException("Length of points and values not equal: " + length(points) + ": " + l))
    end # if
    if points isa AbstractRange
        deltaX::Float64 = convert(Float64, step(points))
        return (sum(abs2.(values)) - (abs2(values[1]) + abs2(values[l]))/2) * deltaX
    end # if
    result::Float64 = 0.
    previousPoint::Real = points[1]
    previousValue::Complex = complex(values[1])
    for idx in 2:length(points)
        nextPoint::Real = points[idx]
        nextValue::Complex = complex(values[idx])
        result += abs2((nextValue + previousValue) / 2) * (nextPoint - previousPoint)
        previousPoint = nextPoint
        previousValue = nextValue
    end # for idx
    return result
end # _norm_sqr

function _innerProduct(
        points::AbstractArray{<:Real, 1}, 
        vPsi0::Union{AbstractArray{<:Number, 1}},
        vPhi0::Union{AbstractArray{<:Number, 1}})::ComplexF64
    vPsi::AbstractArray{<:Complex, 1} = complex(vPsi0)
    vPhi::AbstractArray{<:Complex, 1} = complex(vPhi0)
    l::Int = length(points)
    if points isa AbstractRange
        deltaX::Real = step(points)
        return (LinearAlgebra.dot(vPsi, vPhi) - (conj(vPsi[1]) * vPhi[1] + conj(vPsi[l]) * vPhi[l])/2) * deltaX
    end # if
    result::ComplexF64 = 0.
    previousPoint::Real = points[1]
    previousValue::Complex = conj(vPsi[1]) * vPhi[1]
    for idx in 2:l
        nextPoint::Real = points[idx]
        nextValue::Complex = conj(vPsi[idx]) * vPhi[idx]
        result += (nextValue + previousValue) / 2 * (nextPoint - previousPoint)
        previousPoint = nextPoint
        previousValue = nextValue
    end # for idx
    return result
end # _innerProduct

function innerProduct(psi::AbstractWaveFunction, phi::AbstractWaveFunction, representation::PositionRepresentation)::Number
    return _innerProduct(representation.points, values(psi, representation), values(phi, representation))
end # innerProduct

"A wave function defined in position space by its values at a set of fixed points"
struct PointsWaveFunction <: AbstractWaveFunction
    "base points in x coordinates"
    points::AbstractArray{<:Real, 1}
    "values of the wave function at the base points"
    values::AbstractArray{<:Complex, 1}
    "used internally"
    normSquared::Union{<:Real, Nothing}
    function PointsWaveFunction(points::AbstractArray{<:Real, 1}, 
            values::AbstractArray{<:Number, 1}, 
            normSquared::Union{Nothing, Real}=nothing; cacheNorm::Bool = true)
        if length(values) !== length(points)
            throw(error("Length of wave function array does not match number of grid points " + length(values) + " - " + length(points)))
        end # if
        normSquared::Union{<:Real, Nothing} = isnothing(normSquared) ? (cacheNorm ? _norm_sqr(points, values) : nothing) : normSquared
        return new(points, complex(values), normSquared)
    end # constructor
end # PointsWaveFunction

"A wave function defined in position space by an arbitrary function"
struct PositionWaveFunction <: AbstractWaveFunction
    func::Any
    "Pass a complex function of a single argument"
    function PositionWaveFunction(func::Any)
        if !(func isa Function)
            throw(ErrorException(string("Argument passed is not a function ", func)))
        end # if
        return new(func)
    end # constructor    
end # PositionWaveFunction

function asWavefunction(values::AbstractArray{<:Number, 1}, representation::PositionRepresentation; cacheNorm::Bool = true)::AbstractWaveFunction
    return PointsWaveFunction(representation.points, values; cacheNorm=cacheNorm)
end

"A wave function translated by a Weyl-Operator U(q,p)"
struct TranslatedWaveFunction <: AbstractWaveFunction
    psi0::AbstractWaveFunction
    point::Point
    hbar::Real
end # TranslatedWaveFunction

struct ScaledWaveFunction <: AbstractWaveFunction
    psi0::AbstractWaveFunction
    factor::Number
end # ScaledWaveFunction

struct SumWaveFunction <: AbstractWaveFunction
    psis::AbstractArray{AbstractWaveFunction, 1}
end # SumWaveFunction

function Base.:values(psi::PointsWaveFunction, representation::PositionRepresentation)::AbstractArray{<:Complex, 1}
    if psi.points == representation.points
        return psi.values
    end
    pnts1::AbstractArray{<:Real, 1} = psi.points
    l1::Int = length(pnts1)
    pnts2::AbstractArray{<:Real, 1} = representation.points
    l2::Int = length(pnts2)
    if pnts2[1] >= pnts1[l1] || pnts2[l2] <= pnts1[1]
        throw(ErrorException("No overlap between wave function grid and representation grid"))
    end #if
    idx1::Int = 1
    v::AbstractArray{ComplexF64} = fill(complex(0.), l2)
    for idx2 in 1:l2
        pnt2::Real = pnts2[idx2]
        idxNext::Union{Int, Nothing} = findnext(pnt -> pnt >= pnt2, pnts1, idx1)
        if isnothing(idxNext)
            break
        end # if
        pntNext::Real = pnts1[idxNext]
        if pntNext === pnt2            
            v[idx2] = psi.values[idxNext]
        else
            idxPrev::Union{Int, Nothing} = findprev(pnt -> pnt <= pnt2, pnts1, idxNext)
            if !isnothing(idxPrev)
                pntPrev::Real = pnts1[idxPrev]
                v[idx2] = psi.values[idxPrev] + (psi.values[idxNext] - psi.values[idxPrev]) * (pnt2 - pntPrev) / (pntNext - pntPrev)
            end # if 
        end # if
        idx1 = idxNext
    end # for idx2
    return v
end # values

function Base.:values(psi::PositionWaveFunction, representation::PositionRepresentation)::AbstractArray{<:Complex, 1}
    return map(pt -> complex(psi.func(pt)), representation.points)
end # values

function norm_sqr(psi::PointsWaveFunction, representation::PositionRepresentation)::Real
    if !isnothing(psi.normSquared) && psi.points == representation.points
        return psi.normSquared
    end
    return _norm_sqr(representation.points, values(psi, representation))
end # norm

function norm_sqr(psi::AbstractWaveFunction, representation::PositionRepresentation)::Real
    return _norm_sqr(representation.points, values(psi, representation))
end # norm_sqr

"Apply the Weyl operator U(q,p) to psi.psi0"
function Base.:values(psi::TranslatedWaveFunction, representation::PositionRepresentation)::AbstractArray{<:Complex, 1}
    p::Real = psi.point.p
    q::Real = psi.point.q
    if p == 0 && q == 0
        return values(psi.psi0, representation)
    end
    # Note that psi0 should not be a PositionWaveFunction, because the weylTranslate operation on a such
    # returns a new PositionWaveFunction, not TranslatedWaveFunction
    psi0::AbstractWaveFunction = psi.psi0
    hbar::Real = qmConfig(representation).hbar
    if psi0 isa PointsWaveFunction
        # whether they are the same or not is not really important
        oldPoints::AbstractArray{<:Real, 1} = psi0.points
        oldValues::AbstractArray{<:Complex, 1} = psi0.values
        oldLength::Int = length(oldPoints)
        newPoints::AbstractArray{<:Real, 1} = representation.points
        newLength::Int = length(newPoints)
        newValues::AbstractArray{<:Complex, 1} = Array{ComplexF64, 1}(undef, newLength)
        idx::Int=1  # in oldPoints
        for newIdx in 1:newLength
            x = newPoints[newIdx]
            x1::Real = x + q
            while oldPoints[idx] < x1 && idx<oldLength
                idx = idx + 1
            end # while
            xOld::Real = oldPoints[idx]
            local psiShifted::Complex
            if xOld == x1
                psiShifted = oldValues[idx]
            elseif idx === 1
                newValues[newIdx] = 0.
                continue
            elseif idx === oldLength
                fill!(view(newValues, newIdx:newLength), 0.)
                break
            else # generic case
                xOldPrev::Real = oldPoints[idx-1]
                fraction::Real = (x1-xOldPrev) / (xOld - xOldPrev)
                prevValue::Complex = oldValues[idx-1]
                psiShifted = prevValue + fraction * (oldValues[idx] - prevValue)
            end
            newValues[newIdx] = psiShifted * exp(-im/hbar * p * (x + q/2))
        end 
        return newValues
    end # if
    # TODO check if the below works
    # Likely we should not even run into this...
    v::AbstractArray{<:Complex, 1} = values(psi.psi0, representation)
    pnts::AbstractArray{<:Real, 1} = representation.points
    deltaX::Real = pnts[2] - pnts[1]  # FIXME below we assume constant grid spacing... validate this at least!
    # psi(x+q) in discretized form is a shift by a certain amount of indices
    indicesShift0::Real = q / deltaX
    indicesShiftLower::Int = convert(Int, floor(indicesShift0))
    indicesShiftFraction::Real = indicesShift0 - indicesShiftLower
    l::Int = length(pnts)
    "Shift function and apply linear interpolation between points"
    function vShifted(idx::Int)::Complex
        newIndex::Int = idx + indicesShiftLower
        frac::Real = indicesShiftFraction
        if newIndex >= l
            return 0.
            #newIndex = l
            #frac = 0.
        elseif newIndex < 1
            return 0.
            #newIndex = 1
            #frac = 0.
        end # if
        vLower::Complex = v[newIndex]
        if frac === 0.
            return vLower
        end # if
        return vLower + frac * (v[newIndex + 1] - vLower)
    end # vShifted
    # FIXME a loop for creating the shifted values would be more efficient
    shiftedPsis::AbstractArray{<:Complex, 1} = map(idx -> vShifted(idx) * exp(-im/hbar * p * (pnts[idx] + q/2)), 1:l)
    return shiftedPsis
end # values

function Base.:values(psi::ScaledWaveFunction, representation::QmRepresentation)::AbstractArray{<:Complex, 1}
    return psi.factor .* values(psi.psi0, representation)
end # values

function norm_sqr(psi::ScaledWaveFunction, representation::QmRepresentation)::Real
    return abs2(psi.factor) * norm_sqr(psi.psi0, representation)
end # norm_sqr

function norm_sqr(psi::ScaledWaveFunction, representation::PositionRepresentation)::Real
    return abs2(psi.factor) * norm_sqr(psi.psi0, representation)
end # norm_sqr

function Base.:values(psi::SumWaveFunction, representation::QmRepresentation)::AbstractArray{<:Complex, 1}
    return sum(wf -> values(wf, representation), psi.psis)
end # values

function sampled(psi::PositionWaveFunction, points::AbstractArray{<:Real, 1})::PointsWaveFunction
    values::AbstractArray{<:Number, 1} = map(x -> psi.func(x), points)
    return PointsWaveFunction(points, values)
end # sampled

"""
The momentum space values of a position space wave function (=> Fourier transform)
"""
function Base.:values(psi::PointsWaveFunction, representation::MomentumRepresentation)::AbstractArray{<:Complex, 1}
    pointsP::AbstractArray{<:Real, 1} = representation.points
    pointsX::AbstractArray{<:Real, 1} = psi.points
    hbar::Real = qmConfig(representation).hbar
    prefactor::Real = 1/sqrt(2*pi*hbar)
    if pointsX isa AbstractRange
        deltaX::Float64 = convert(Float64, step(pointsX))
        return map(p -> prefactor * deltaX * sum(LinearAlgebra.dot(psi.values, exp.(-im/hbar * p * pointsX))), pointsP)
    end # if
    lP::Int = length(pointsP)
    lX::Int = length(pointsX)
    v::AbstractArray{ComplexF64} = fill(complex(0.), lP)
    for idxP in 1:lP
        p = pointsP[idxP]
        previousX::Real = points[1]
        result::ComplexF64 = 0.
        for idxX in 1:lX
            x = pointsX[idxX]
            result += psi.values[idxX] * exp(-im/hbar*p*x) * (x-previousX)
            previousX = x
        end 
        v[idxP] = result
    end # for idx
    return v
end # values



"Apply the Weyl operator U(q,p) to the wave function psi"
function weylTranslate(psi::AbstractWaveFunction, point0::AbstractPoint, hbar::Real)::AbstractWaveFunction
    point::Point = pin(point0)
    if point.q == 0 && point.p == 0
        return psi
    end # if
    return TranslatedWaveFunction(psi, point, hbar)
end # weylTranslate

"Apply the Weyl operator U(q,p) to the wave function psi"
function weylTranslate(psi::PositionWaveFunction, point0::AbstractPoint, hbar::Real)::PositionWaveFunction
    point::Point = pin(point0)
    if point.q == 0 && point.p == 0
        return psi
    end # if
    newFunc = x -> exp(-im / hbar * point.p * (x + point.q/2)) * psi.func(x + point.q)
    return PositionWaveFunction(newFunc)
end # weylTranslate


# scalar multiplication
Base.:*(c::Number, psi::PointsWaveFunction) = PointsWaveFunction(psi.points, c * psi.values, isnothing(psi.normSquared) ? nothing : abs2(c) * psi.normSquared)
Base.:*(psi::PointsWaveFunction, c::Number) = Base.:*(c, psi)
Base.:*(c::Number, psi::PositionWaveFunction) = PositionWaveFunction(x -> c * psi.func(x))
Base.:*(psi::PositionWaveFunction, c::Number) = Base.:*(c, psi)
Base.:*(c::Number, psi::AbstractWaveFunction) = ScaledWaveFunction(psi, c)
Base.:*(psi::AbstractWaveFunction, c::Number) = Base.:*(c, psi)
Base.:/(psi::AbstractWaveFunction, c::Number) = Base.:*(1/c, psi)
Base.:-(psi::AbstractWaveFunction) = -1 * psi
# addition
function Base.:+(psi1::PointsWaveFunction, psi2::PointsWaveFunction)
    if psi1.points == psi2.points
        return PointsWaveFunction(psi1.points, psi1.values .+ psi2.values)
    end # if
    return SumWaveFunction([psi1, psi2])
end # +
Base.:+(psi1::PositionWaveFunction, psi2::PositionWaveFunction) = PositionWaveFunction(x -> psi1.func(x) + psi2.func(x))
Base.:+(psi1::AbstractWaveFunction, psi2::AbstractWaveFunction) = SumWaveFunction([psi1, psi2])
Base.:-(psi1::AbstractWaveFunction, psi2::AbstractWaveFunction) = psi1 + (-psi2)
LinearAlgebra.:normalize(psi::AbstractWaveFunction, representation::QmRepresentation) = normalize(psi, representation)

##### Utitlity functions below


export AbstractWaveFunction, norm_sqr, expectationValue, normalize, asWavefunction
export PointsWaveFunction, PositionWaveFunction, sampled
export weylTranslate
