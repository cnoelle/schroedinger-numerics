"""
This is used to model a wave function whose dependence on time t and space x
is known in an analytical form, given by the function f(t, x).
"""
struct ExactWaveFunction <: AbstractWaveFunction
    "A function of two arguments, t and x (both Real), with Complex values"
    f::Any
    timestamp::Real
    function ExactWaveFunction(f::Any, timestamp::Union{Nothing, Real}=nothing)
        if isnothing(timestamp)
            timestamp = 0.
        end # if
        return new(f, timestamp)
    end # constructor
end # ExactWaveFunction

function Base.:values(psi::ExactWaveFunction, representation::PositionRepresentation)::AbstractArray{<:Complex, 1}
    t::Real = psi.timestamp
    f::Any = psi.f
    return map(x -> f(t, x), representation.points)
end # values

function weylTranslate(psi::ExactWaveFunction, point0::AbstractPoint, hbar::Real)::ExactWaveFunction
    point::Point = pin(point0)
    if point.q == 0 && point.p == 0
        return psi
    end # if
    f = psi.f
    newFunc = (t::Real, x::Real) -> exp(-im/hbar*point.p * (x+point.q/2)) * f(t, x + point.q)
    return ExactWaveFunction(newFunc, psi.timestamp)
end # weylTranslate

Base.:*(c::Number, psi::ExactWaveFunction) = ExactWaveFunction((t,x) -> c * psi.f(t, x), psi.timestamp)
# Here we need to pin the exact method invocation we want, 
# there seems to be some ambiguity with another implementation in Base
Base.:*(psi::ExactWaveFunction, c::Number) = Core.invoke(Base.:*, Tuple{Number, ExactWaveFunction}, c, psi)
Base.:-(psi::ExactWaveFunction) = Core.invoke(Base.:*, Tuple{Number, ExactWaveFunction}, -1, psi)
function Base.:+(psi1::ExactWaveFunction, psi2::ExactWaveFunction)
    if psi1.timestamp != psi2.timestamp
        throw(ErrorException("Cannot add wave functions at different timesteps"))
    end #if
    return ExactWaveFunction((t,x) -> psi1.f(t, x) + psi2.f(t, x), psi1.timestamp)
end # Base.:+
Base.:-(psi1::ExactWaveFunction, psi2::ExactWaveFunction) = psi1 + (-psi2)

"TODO document what exactly this is good for"
struct ExactSampledWaveFunction <: AbstractWaveFunction
    psi0::AbstractArray{<:AbstractWaveFunction, 1}
    "Function of one argument t (Float64)"
    f::AbstractArray{<:Any, 1}
    length::Int
    timestamp::Real
    function ExactSampledWaveFunction(psi0::AbstractWaveFunction, f::Any, timestamp::Union{Nothing, Real}=nothing)
        if isnothing(timestamp)
            timestamp = 0.
        end # if
        return new([psi0], [f], 1, timestamp)
    end # constructor
    function ExactSampledWaveFunction(psi0::AbstractArray{<:AbstractWaveFunction, 1}, 
                f::AbstractArray{<:Any, 1}, timestamp::Union{Nothing, Real}=nothing)
        if isnothing(timestamp)
            timestamp = 0.
        end # if
        if length(psi0) !== length(f)
            throw(ErrorException("Invalid arguments: length of psi0 must equal length(f), got " * string(length(psi0)) * " - " * string(length(f))))
        end
        return new(psi0, f, length(psi0), timestamp)
    end # constructor
end # ExactWaveFunction

function Base.:values(psi::ExactSampledWaveFunction, representation::QmRepresentation)::AbstractArray{ComplexF64, 1}
    return sum(idx ->  psi.f[idx](psi.timestamp) * values(psi.psi0[idx], representation), 1:psi.length)
end # values

Base.:*(c::Number, psi::ExactSampledWaveFunction) = ExactSampledWaveFunction(psi.psi0, map(f -> (t -> c * f(t)), psi.f), psi.timestamp)
Base.:*(psi::ExactSampledWaveFunction, c::Number) = Core.invoke(Base.:*, Tuple{Number, ExactSampledWaveFunction}, c, psi)
Base.:-(psi::ExactSampledWaveFunction) = Core.invoke(Base.:*, Tuple{Number, ExactSampledWaveFunction}, -1, psi)
function Base.:+(psi1::ExactSampledWaveFunction, psi2::ExactSampledWaveFunction)
    if psi1.timestamp != psi2.timestamp
        throw(ErrorException("Cannot add wave functions at different timesteps"))
    end #if
    return ExactSampledWaveFunction([psi1.psi0; psi2.psi0], [psi1.f; psi2.f], psi1.timestamp)
end # Base.:+
Base.:-(psi1::ExactSampledWaveFunction, psi2::ExactSampledWaveFunction) = psi1 + (-psi2)

function weylTranslate(psi::ExactSampledWaveFunction, point0::AbstractPoint, hbar::Real)::ExactSampledWaveFunction
    point::Point = pin(point0)
    if point.q == 0 && point.p == 0
        return psi
    end # if
    return ExactSampledWaveFunction(map(phi -> weylTranslate(phi, point0, hbar), psi.psi0), psi.f, psi.timestamp)
end # weylTranslate

struct TranslatedExactWaveFunction <: AbstractWaveFunction
    trajectory::ExactTrajectory
    psi::ExactSampledWaveFunction
    hbar::Real
end

function Base.:values(psi::TranslatedExactWaveFunction, representation::QmRepresentation)::AbstractArray{<:Complex, 1}
    wavef::ExactSampledWaveFunction=psi.psi
    t::Real = wavef.timestamp
    point::Point = psi.trajectory.f(t)
    hbar::Real = qmConfig(representation).hbar
    return values(ExactSampledWaveFunction(map(phi -> weylTranslate(phi, point, hbar), wavef.psi0), wavef.f, t), representation)
end # values

Base.:*(c::Number, psi::TranslatedExactWaveFunction) = TranslatedExactWaveFunction(psi.trajectory, c*psi.psi, psi.hbar)
Base.:*(psi::TranslatedExactWaveFunction, c::Number) = Core.invoke(Base.:*, Tuple{Number, TranslatedExactWaveFunction}, c, psi)
Base.:-(psi::TranslatedExactWaveFunction) = Core.invoke(Base.:*, Tuple{Number, TranslatedExactWaveFunction}, -1, psi)

export ExactWaveFunction, ExactSampledWaveFunction, TranslatedExactWaveFunction

