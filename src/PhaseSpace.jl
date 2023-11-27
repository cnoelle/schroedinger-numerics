##### abstract types and functions ########

"A point in phase space (x,p)"
abstract type AbstractPoint
end # AbstractPoint

struct Point <: AbstractPoint
    q::Real
    p::Real
end # Point

function pin(p::AbstractPoint)::Point
    throw(ErrorException("Not implemented"))
end # pin

function pin(p::Point)::Point
    return p
end # pin

Base.:convert(::Type{A}, point::Point) where {T<:Real, A<:AbstractArray{T, 1}} = convert(A, [convert(T, point.q), convert(T, point.p)])
Base.:convert(type::Type{A}, point::AbstractPoint) where {T<:Real, A<:AbstractArray{T, 1}} = convert(type, pin(point))
Base.:length(::AbstractPoint)::Integer = 2
# https://itnext.io/generators-and-iterators-in-julia-and-python-6c9ace18fa93
function Base.:iterate(point::Point, coords=[:q, :p]) 
    if isempty(coords)
        return nothing
    else
        return getfield(point, coords[1]), coords[2:end]
    end
end
Base.:iterate(point::AbstractPoint, coords=[:q, :p]) = Base.:iterate(pin(point), coords)

Base.:*(scalar::Real, point::Point) = Point(scalar * point.q, scalar * point.p)
Base.:+(point1::Point, point2::Point) = Point(point1.q + point2.q, point1.p + point2.p)
Base.:-(point1::Point, point2::Point) = Point(point1.q - point2.q, point1.p - point2.p)
struct SumPoint <: AbstractPoint
    points::AbstractArray{<:AbstractPoint, 1}
end # SumPoint
struct ScaledPoint <: AbstractPoint
    scalar::Real
    point::AbstractPoint
end # SumPoint
pin(point::SumPoint) = sum(p -> pin(p), point.points)
pin(point::ScaledPoint) = point.scalar * pin(point.point)
Base.:*(scalar::Real, point::AbstractPoint) = ScaledPoint(scalar, point)
Base.:*(point::AbstractPoint, scalar::Real) = Base.:*(scalar, point)
Base.:-(point::AbstractPoint) = -1 * point
Base.:/(point::AbstractPoint, scalar::Real) = Base.:*(1/scalar, point)
Base.:+(point1::AbstractPoint, point2::AbstractPoint) = SumPoint([point1, point2])
Base.:-(point1::AbstractPoint, point2::AbstractPoint) = SumPoint([point1, -point2])

###### export ####

export Point, AbstractPoint, pin
