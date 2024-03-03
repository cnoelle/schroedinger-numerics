"
This module defines both generic QM representations and the position representation.
A representation assigns an operator to every observable (see function `asOperator`),
but also assigns a \"tilde\" operator and \"circle\" operator (functions 
`asTildeOperator` and `asCircleOperator`)
"

##### Abstract types and functions below #####

"A concrete representation of quantum mechanics"
abstract type QmRepresentation 
end # QmRepresentation

#function qmConfig(rep::QmRepresentation)::SchroedingerConfig
#    throw(ErrorException("not implemented"))
#end

"An operator acting on wave functions in a concrete representation"
Operator = Union{AbstractArray{<:Number, 2}, LinearAlgebra.UniformScaling{<:Number}}

"Create a matrix representation of the observable in a specific representation of QM"
function asOperator(V::AbstractObservable, representation::QmRepresentation)::Operator
    throw(ErrorException("not implemented"))
end # asObservable

"
The matrix representation of an observable translated by means of a Weyl operator to 
some point in phase space
"
function asTildeOperator(V::AbstractObservable, point::AbstractPoint, representation::QmRepresentation)::Operator
    throw(ErrorException("not implemented"))
end # asTildeObservable

"
The circle operator, i.e. the operator appearing in the residual Schrödinger equation.
Note that we assume here that the system is \"on-shell\", i.e. the trajectory satisfies 
Hamilton's equations. Otherwise the 'circle operators' would depend on the derivative of the 
trajectory, so this case cannot be covered in our formalism.
"
function asCircleOperator(V::AbstractObservable, point::AbstractPoint, 
        representation::QmRepresentation)::Operator
    throw(ErrorException("not implemented"))
end # asCircleOperator

#### Concrete types and function implementations below #########

struct PositionRepresentation <: QmRepresentation
    points::AbstractArray{<:Real, 1}
    config::SchroedingerConfig
end # PositionRepresentation

struct MomentumRepresentation <: QmRepresentation
    "Points in momentum space"
    points::AbstractArray{<:Real, 1}  
    config::SchroedingerConfig
end # PositionRepresentation

function qmConfig(rep::QmRepresentation)::SchroedingerConfig
    return rep.config
end

# see DifferentiationUtils for _diffOperator
function _values(V::XDerivative, representation::PositionRepresentation)::AbstractArray{<:Real, 1}
    values0::AbstractArray{<:Real, 1} = _values(V.baseFunction, representation)
    return _diffOperator(representation.points, V.diffOrder, diffMethod=qmConfig(representation).firstDerivativeMethod) * values0
end # _values

function _values(V::AbstractXFunction, representation::PositionRepresentation)::AbstractArray{<:Real, 1}
    return V.(representation.points)
end # _values

function deltaX(rep::PositionRepresentation)::Real
    pnts::AbstractArray{<:Real, 1} = rep.points
    return pnts isa AbstractRange ? step(pnts) : sum(pnts[2:lPoints] - pnts[1:lPoints-1])/(lPoints - 1)
end # deltaX

function asOperator(V::XDerivative, representation::PositionRepresentation)::AbstractArray{<:Real, 2}
    return LinearAlgebra.Diagonal(_values(V, representation))
end # asOperator

function asOperator(V::Union{XFunction, XPolynomial}, representation::PositionRepresentation)::AbstractArray{<:Real, 2}
    return LinearAlgebra.Diagonal(map(x -> V.func(x), representation.points))
end # asOperator

function asOperator(V::SampledXFunction, representation::PositionRepresentation)::AbstractArray{<:Real, 2}
    if V.points == representation.points
        return LinearAlgebra.Diagonal(V.values)
    end
    return LinearAlgebra.Diagonal(V.(representation.points))
end # asOperator

function asOperator(P::PMonomial, representation::PositionRepresentation)::Operator
    config = qmConfig(representation)
    M::AbstractArray{<:Real, 2} = _diffOperator(representation.points, P.power, diffMethod=config.firstDerivativeMethod)
    hbar = config.hbar
    if P.power % 2 === 0
        return (-1)^(convert(Int, P.power/2)) * hbar^P.power * M  # this is real
    else
        return (-im * hbar)^P.power * M # this is imaginary
    end 
end # asOperator

function asOperator(PV::PMonomialXFunction, representation::QmRepresentation)::Operator
    p::Int = PV.P.power 
    if p === 0
        return asOperator(PV.V, representation)
    end # if
    # McCoy's formula, https://en.wikipedia.org/wiki/Wigner%E2%80%93Weyl_transform
    return 2^(-p) * sum(k -> binomial(p, k) * asOperator(PMonomial(k), representation) * asOperator(PV.V, representation) 
            * asOperator(PMonomial(p-k), representation), 0:p)
end # asOperator

function asTildeOperator(V::AbstractXFunction, point::AbstractPoint, representation::PositionRepresentation)::Operator
    q::Real = pin(point).q
    shiftedRepresentation = PositionRepresentation(map(x -> x+q, representation.points), representation.config)
    return LinearAlgebra.Diagonal(_values(V, shiftedRepresentation))
end # asTildeOperator

function asTildeOperator(P::PMonomial, point::AbstractPoint, representation::PositionRepresentation)::Operator
    d::Int = P.power
    p::Real = pin(point).p
    return p^d * LinearAlgebra.I + sum(k -> binomial(d, k) * p^(d-k) * asOperator(PMonomial(k), representation), 1:d)
end # asTildeOperator

# TODO same for asTildeOperator for generic representations?
function _circleOperatorViaDerivatives(
        V::AbstractXFunction, point::AbstractPoint, representation::QmRepresentation)::AbstractArray{<:Real, 2}
    config::SchroedingerConfig=qmConfig(representation)
    derivatives::AbstractArray{AbstractXFunction, 1} = differentiateX(V, limitOrder=config.limitDiffOrder)
    newCoefficients::AbstractArray{<:Real, 1} = map(k -> k(pin(point).q), derivatives)
    empty::Bool = isempty(newCoefficients)
    q = pin(point).q
    if !empty
        newCoefficients[1] = 0.         # remove first derivative term
        zerothOrder::Real = config.includeIntegralFactor ? 0. : V(q) - q * derivatives[1](q) / 2
        pushfirst!(newCoefficients, zerothOrder)
    end # if
    polynomial::XPolynomial = XPolynomial(newCoefficients)
    return asOperator(polynomial, representation)
end # _circleOperatorViaDerivatives

function asCircleOperator(V::XPolynomial, point::AbstractPoint, representation::PositionRepresentation)::AbstractArray{<:Real, 2}
    return _circleOperatorViaDerivatives(V, point, representation)
end # asCircleOperator

# for a general representation; position representation below
# This is in general not exact, since we cannot calculate the infinite series of derivatives. 
function asCircleOperator(V::AbstractXFunction, point::AbstractPoint, representation::QmRepresentation)::AbstractArray{<:Real, 2}
    return _circleOperatorViaDerivatives(V, point, representation)
end # asCircleOperator

raw"""
Represent a generic potential (not a polynomial) as an operator on \Phi as
    \circ V\cdot \Phi(t,x) = [ V(q(t) + x) - V'(q(t)) * (x + 1/2 q(t)) ]\Phi(t, x)
if config.includeIntegralFactor is false, or 
    \circ V\cdot \Phi(t,x) = [ V(q(t) + x) - V(q) - V'(q(t)) * x ]\Phi(t, x)
if it is true.
Note that this way we do not need to approximate the operator by truncating the Taylor expansion after
a finite number of terms, as in the more generic case above (generic representation)
"""
function asCircleOperator(V::AbstractXFunction, point::AbstractPoint, representation::PositionRepresentation)::Operator
    dff = differentiateX(V, limitOrder=1)
    firstDerivative::AbstractXFunction = length(dff) > 0 ? dff[1] : ConstantFunction(0)
    includeIntegralFactor::Bool = qmConfig(representation).includeIntegralFactor
    function diffX(x::Real)::Real
        try  # not implemented for generic functions
           return firstDerivative(x)
        catch
            d::XDerivative = firstDerivative
            step::Real = deltaX(representation)
            return (d.baseFunction(x + step) - d.baseFunction(x - step))/2/step
        end
    end # diffX
    q = pin(point).q
    diag::AbstractArray{<:Real, 1} = includeIntegralFactor ?
            map(x -> V(q + x) - diffX(q) * x - V(q), representation.points) :
            map(x -> V(q + x) - diffX(q) * (x + q / 2), representation.points)
    return LinearAlgebra.Diagonal(diag)
end # asCircleOperator

function asCircleOperator(P::PMonomial, point::AbstractPoint, representation::QmRepresentation)::Operator
    d::Int = P.power
    p::Real = pin(point).p
    includeIntegralFactor::Bool = qmConfig(representation).includeIntegralFactor
    if d === 0
        return LinearAlgebra.UniformScaling(includeIntegralFactor ? 0 : 1)  # or 0?
    elseif d === 1
        return LinearAlgebra.UniformScaling(includeIntegralFactor ? 0 : p/2)
    elseif d === 2
        return asOperator(PMonomial(2), representation)  # independent of includeIntegralFactor
    end # if
    #return (1-d/2)*p^d * LinearAlgebra.I + sum(k -> binomial(d, k) * p^(d-k) * asOperator(PMonomial(k), representation), 2:d) 
    return includeIntegralFactor ?
            sum(k -> binomial(d, k) * p^(d-k) * asOperator(PMonomial(k), representation), 2:d)  :
            LinearAlgebra.UniformScaling((1-d/2)*p^d) + sum(k -> binomial(d, k) * p^(d-k) * asOperator(PMonomial(k), representation), 2:d) 
end # asCircleObservable


###################

function asOperator(f::Union{XProdFunction, PProdFunction},representation::QmRepresentation)::Operator
    return prod(func -> asOperator(func, representation), f.functions)
end # asOperator

function asOperator(f::Union{SumFunction, XSumFunction, PSumFunction}, representation::QmRepresentation)::Operator
    return sum(func -> asOperator(func, representation), f.functions)
end # asOperator

function asOperator(f::Union{ScalarProdFunction, ScalarXProdFunction, ScalarPProdFunction}, 
            representation::QmRepresentation)::Operator
    return f.scalar * asOperator(f.func, representation)
end # asOperator

function asOperator(f::Union{ScalarSumFunction, ScalarXSumFunction}, representation::QmRepresentation)::Operator
    return f.scalar * LinearAlgebra.I + asOperator(f.func, representation)
end # asOperator

function asTildeOperator(f::Union{SumFunction, XSumFunction, PSumFunction}, point::AbstractPoint, representation::QmRepresentation)::Operator
    return sum(func -> asTildeOperator(func, point, representation), f.functions)
end # asTildeOperator

function asTildeOperator(f::Union{ScalarProdFunction, ScalarXProdFunction, ScalarPProdFunction}, 
            point::AbstractPoint, representation::QmRepresentation)::Operator
    return f.scalar * asTildeOperator(f.func, point, representation)
end # asTildeOperator

function asTildeOperator(f::Union{ScalarSumFunction, ScalarXSumFunction}, representation::QmRepresentation)::Operator
    return LinearAlgebra.UniformScaling(f.scalar) + asTildeOperator(f.func, representation)
end # asTildeOperator
    
function asCircleOperator(f::Union{SumFunction, XSumFunction, PSumFunction}, point::AbstractPoint, representation::QmRepresentation)::Operator
    return sum(func -> asCircleOperator(func, point, representation), f.functions)
end # asCircleOperator

function asCircleOperator(f::Union{ScalarProdFunction, ScalarXProdFunction, ScalarPProdFunction}, 
            point::AbstractPoint, representation::QmRepresentation)::Operator
    return f.scalar * asCircleOperator(f.func, point, representation)
end # asCircleOperator

function asCircleOperator(f::Union{ScalarSumFunction, ScalarXSumFunction}, point::AbstractPoint, representation::QmRepresentation)::Operator
    includeIntegralFactor::Bool = config(representation).includeIntegralFactor
    circ = asCircleOperator(f.func, point, representation)
    return includeIntegralFactor ? circ : circ + LinearAlgebra.UniformScaling(f.scalar)
end # asCircleOperator


export QmRepresentation, PositionRepresentation, MomentumRepresentation, qmConfig,
    Operator, asOperator, asTildeOperator, asCircleOperator, deltaX
