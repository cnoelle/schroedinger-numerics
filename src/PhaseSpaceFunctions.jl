# This file contains definitions of phase space concepts, such as
# AbstractObservable, and useful implementations

##### abstract types and functions ########

"A function on phase space, i.e. a real function of two variables x and p."
abstract type AbstractObservable
end # AbstractObservable

"
A function on configuration space, e.g. the potential V(x) appearing in the Hamiltonian.
May be evaluated on two variables (x,p) like AbstractObservable, or on a single variable (x)
"
abstract type AbstractXFunction <: AbstractObservable
end # AbstractXFunction

"A function of the momentum only. Requires two arguments (x,p) nevertheless"
abstract type AbstractPFunction <: AbstractObservable
end # AbstractXFunction

function (f::AbstractObservable)(point::Point)::Real
    return f(point.q, point.p)
end # function

function (f::AbstractObservable)(point::AbstractPoint)::Real
    return f(pin(point))
end # function

"calculate higher order derivatives, up to order limitOrder"
function differentiateX(f::AbstractObservable; limitOrder::Union{Nothing, Int} = nothing)::AbstractArray{<:AbstractObservable, 1}
    throw(ErrorException("not implemented"))
end #differentiateX

"first derivative w.r.t. p"
function differentiateP1(f::AbstractObservable)::AbstractObservable
    throw(ErrorException("not implemented"))
end # differentiateP1

##### concrete types and implementations below ####

"Create a polynomial function of x; internal helper method"
function _coefficientsToFunction(coeff::AbstractArray{<:Real, 1})::Any
    if isempty(coeff)
        return (x::Real, p::Union{Real, Nothing} = nothing) -> 0
    end
    function result(x::Real, p::Union{Real, Nothing} = nothing)::Real
        return sum(k -> coeff[k] * x^(k-1) / factorial(k-1), 1:length(coeff))
    end # result
    return result
end # potential

struct XFunction <: AbstractXFunction
    "a function f: (Real, Real) -> Real, (x, p) |-> f(x,p) on phase space that only depends on x. 
      The p argument must be optional, i.e. the function must also accept a single argument x."
    func::Any
    "Optional function of three arguments, (diffOrder::Int, x::Real, p::Union{Real, Nothing}=nothing) -> Real"
    derivatives::Union{Nothing, Any}
    function XFunction(func::Any, derivatives::Union{Nothing, Any}=nothing)
        if !(func isa Function)
            throw(ErrorException(string("Argument passed is not a function ", func)))
        end # if
        return new(func, derivatives)
    end # constructor
end

struct XPolynomial <: AbstractXFunction
    # Note: the convention for the polynomial coefficients implies that the derivative is equivalent to dropping the first entry
    "Coefficients [V_0, V_1, ... ] of the polynomial: V(x) = V_0 + V_1 * x + 1/2 V_2 x^2 + ... + 1/k! V_k x^k"
    coefficients::AbstractArray{<:Real, 1}
    "A function Real -> Real"
    func::Any
    function XPolynomial(coefficients::AbstractArray{<:Real, 1})
        return new(coefficients, _coefficientsToFunction(coefficients))
    end # constructor
end # XPolynomial

struct SampledXFunction <: AbstractXFunction
    points::AbstractArray{<:Real, 1}
    values::AbstractArray{<:Real, 1}
    function SampledXFunction(points::AbstractArray{<:Real, 1}, values::AbstractArray{<:Real, 1})
        if length(values) !== length(points)
            throw(error("Length of values does not match number of grid points " + length(values) + " - " + length(points)))
        end # if
        return new(points, values)
    end # constructor
end # SampledXFunction

struct ConstantFunction <: AbstractXFunction
    value::Real
    function ConstantFunction(value::Real=0)
        return new(value)
    end
end 

struct XDerivative <: AbstractXFunction
    baseFunction::AbstractXFunction
    diffOrder::Int
end # XDerivative

struct PMonomial <: AbstractPFunction
    power::Int
end # PMonomial

"Represents the multiplication of a function of x with a monomial in P. 
In the position representation this is represented by a symmetrized operator of p and V(q)"
struct PMonomialXFunction <: AbstractObservable
    P::PMonomial
    V::AbstractXFunction
end 

function (f::XFunction)(x::Real, p::Union{Real, Nothing} = nothing)::Real
    return f.func(x, p)
end #  

function (f::XPolynomial)(x::Real, p::Union{Real, Nothing} = nothing)::Real
    return f.func(x, p)
end #

function (f::SampledXFunction)(x::Real, p::Union{Real, Nothing} = nothing)::Real
    points = f.points
    values = f.values
    l::Int = length(points)
    startIdx = 1
    endIdx = l
    endPoint = points[endIdx]
    startPoint = points[startIdx]
    # some special cases first
    if startPoint > x   # linear extrapolation
        return values[1] - 
            (startPoint - x)/(points[2] - points[1]) * (values[2] - values[1])
    elseif startPoint == x
        return values[1]
    elseif endPoint < x  # linear extrapolation
        return values[l] + 
            (x - endPoint) / (points[l] - points[l-1]) * (values[l] - values[l-1])
    elseif endPoint == x
        return values[l]
    end 
    while startIdx < endIdx - 1
        centerIdx = Int(floor((endIdx + startIdx)/2))
        centerValue = points[centerIdx]
        if centerValue == x
            return values[centerIdx]
        elseif centerValue < x 
            startIdx = centerIdx
            startPoint = centerValue
        else
            endIdx = centerIdx
            endPoint = centerValue
        end # if
    end
    fraction = (x - startPoint) / (endPoint - startPoint)
    value = values[startIdx] + fraction * (values[endIdx] - values[startIdx])
    return value
end #

function (f::ConstantFunction)(::Real, p::Union{Real, Nothing} = nothing)::Real
    return f.value
end

function (f::PMonomial)(::Real, p::Real)::Real
    return p^f.power
end #

"Calculate all derivatives up to a certain order; for convenient usage with polynomials, the order need not be specified.
    The returned array starts with the first derivative"
function differentiateX(V::XPolynomial; limitOrder::Union{Nothing, Int} = nothing)::AbstractArray{<:AbstractObservable, 1}
    order::Int = length(V.coefficients)
    if order == 0
        return V
    elseif order == 1 # constant
        return AbstractObservable[]
    elseif order == 2
        return ConstantFunction(V[2])
    end
    vl::Int = isnothing(limitOrder) ? order : min(limitOrder+1, order)
    V0 = copy(V.coefficients)
    function shift()::AbstractArray{<:Real, 1}
        popfirst!(V0)  # remove first element
        return copy(V0)
    end 
    # outer index: order of derivative; inner index: polynomial coefficient
    V_diff_k::AbstractArray{<:AbstractObservable, 1} =  map(k -> XPolynomial(shift()), 1:vl-1)
    return V_diff_k
end #differentiate

function differentiateX(f::XFunction; limitOrder::Union{Nothing, Int} = nothing)::AbstractArray{<:AbstractObservable, 1}
    limitOrder = isnothing(limitOrder) ? 10 : limitOrder  # default order
    result::AbstractArray{<:AbstractObservable, 1} = AbstractXFunction[]
    for order in 1:limitOrder
        if !isnothing(f.derivatives)
            push!(result, XFunction(
                (x::Real, p::Union{Nothing, Real}=nothing) -> f.derivatives(order, x, p),
                (newOrder::Int, x::Real, p::Union{Nothing, Real}=nothing) -> f.derivatives(order + newOrder, x, p)
            ))
        else
            push!(result, XDerivative(f, order))
        end # if
    end # for i
    return result
end # differentiateX

function differentiateX(P::AbstractPFunction; limitOrder::Union{Nothing, Int} = nothing)::AbstractArray{<:AbstractObservable, 1}
    return AbstractXFunction[]
end # differentiateX

function differentiateX(P::ConstantFunction; limitOrder::Union{Nothing, Int} = nothing)::AbstractArray{<:AbstractObservable, 1}
    return AbstractXFunction[]
end # differentiateX

function differentiateX(PV::PMonomialXFunction; limitOrder::Union{Nothing, Int} = nothing)::AbstractArray{<:AbstractObservable, 1}
    derivatives::AbstractArray{<:AbstractObservable, 1} = differentiateX(PV.V, limitOrder=limitOrder)
    return map(derivative -> PMonomialXFunction(PV.P, derivative), derivatives)
end # differentiateX

function Base.:convert(::Type{XFunction}, f::XPolynomial)
    derivatives = differentiateX(f)
    max_order::Int = length(derivatives)
    function diff(order::Int, x::Real, p::Union{Real,Nothing}=nothing)::Real
        if order > max_order
            return 0
        end
        return derivatives[order](x, p)
    end # diff
    return XFunction(f.func, diff)
end # convert

function differentiateX(f::SampledXFunction; limitOrder::Union{Nothing, Int} = nothing)::AbstractArray{<:AbstractObservable, 1}
    limitOrder = isnothing(limitOrder) ? 10 : limitOrder  # default order
    result::AbstractArray{<:AbstractObservable, 1} = SampledXFunction[]
    for order in 1:limitOrder
        operator = _diffOperator(f.points, order, diffMethod=0)
        newValues = operator * f.values
        push!(result, SampledXFunction(f.points, newValues))
    end # for i
    return result
end # differentiateX

function differentiateP1(::AbstractXFunction)::AbstractXFunction
    return ConstantFunction(0)
end # differentiateP1

function differentiateP1(f::PMonomial)::AbstractObservable
    return f.power * PMonomial(f.power-1)
end # differentiateP1

function differentiateP1(f::PMonomialXFunction)::AbstractObservable
    power::Int = f.P.power
    if power == 0
        return ConstantFunction(0)
    elseif power == 1
        return f.V
    end
    return PMonomialXFunction(differentiateP1(f.P), f.V)
end # differentiateP1

###### basic operations on functions and observables ###############

# utility types, not exported
struct XSumFunction <: AbstractXFunction
    functions::AbstractArray{AbstractXFunction, 1}
end # XSumFunction

struct PSumFunction <: AbstractPFunction
    functions::AbstractArray{AbstractPFunction, 1}
end # PSumFunction

struct SumFunction <: AbstractObservable
    functions::AbstractArray{AbstractObservable, 1}
end # XSumFunction

Base.:convert(::Type{SumFunction}, f::XSumFunction) = SumFunction(f.functions)

struct XProdFunction <: AbstractXFunction
    functions::AbstractArray{AbstractXFunction, 1}
end # XProdFunction

struct PProdFunction <: AbstractPFunction
    functions::AbstractArray{AbstractPFunction, 1}
end # PProdFunction

struct ProdFunction <: AbstractObservable
    functions::AbstractArray{AbstractObservable, 1}
end # ProdFunction

Base.:convert(::Type{ProdFunction}, f::XProdFunction) = ProdFunction(f.functions)
Base.:convert(::Type{ProdFunction}, f::PProdFunction) = ProdFunction(f.functions)

struct ScalarXProdFunction <: AbstractXFunction
    func::AbstractXFunction
    scalar::Real
end # ScalarProdFunction

struct ScalarPProdFunction <: AbstractPFunction
    func::AbstractPFunction
    scalar::Real
end # ScalarProdFunction

struct ScalarProdFunction <: AbstractObservable
    func::AbstractObservable
    scalar::Real
end # ScalarProdFunction

Base.:convert(::Type{ScalarProdFunction}, f::ScalarXProdFunction) = ScalarProdFunction(f.func, f.scalar)
Base.:convert(::Type{ScalarProdFunction}, f::ScalarPProdFunction) = ScalarProdFunction(f.func, f.scalar)

struct ScalarXSumFunction <: AbstractXFunction
    func::AbstractXFunction
    scalar::Real
end # ScalarXSumFunction

struct ScalarSumFunction <: AbstractObservable
    func::AbstractObservable
    scalar::Real
end # ScalarSumFunction

Base.:convert(::Type{ScalarSumFunction}, f::ScalarXSumFunction) = ScalarSumFunction(f.func, f.scalar)

function (f::Union{SumFunction, PSumFunction})(x::Real, p::Real)::Real
    return sum(func -> func(x, p), f.functions)
end

function (f::XSumFunction)(x::Real, p::Union{Real, Nothing} = nothing)::Real
    return sum(func -> func(x, p), f.functions)
end

function (f::Union{ProdFunction, PProdFunction})(x::Real, p::Real)::Real
    return prod(func -> func(x, p), f.functions)
end

function (f::XProdFunction)(x::Real, p::Union{Real, Nothing} = nothing)::Real
    return prod(func -> func(x, p), f.functions)
end

function (f::ScalarProdFunction)(x::Real, p::Real)::Real
    return f.scalar * f.func(x, p)
end

function (f::ScalarXProdFunction)(x::Real, p::Union{Real, Nothing} = nothing)::Real
    return f.scalar * f.func(x, p)
end

function (f::ScalarPProdFunction)(x::Real, p::Real)::Real
    return f.scalar * f.func(x, p)
end

function (f::ScalarSumFunction)(x::Real, p::Real)::Real
    return f.scalar + f.func(x, p)
end

function (f::ScalarXSumFunction)(x::Real, p::Union{Real, Nothing} = nothing)::Real
    return f.scalar + f.func(x, p)
end

function differentiateX(V::Union{SumFunction, XSumFunction}; limitOrder::Union{Nothing, Int} = nothing)::AbstractArray{<:AbstractObservable, 1}
    total_num::Int = length(V.functions)
    if total_num == 0
        return AbstractObservable[]
    elseif total_num == 1
        return differentiateX(V.functions[1])
    end
    total_ps::Int = sum(f->f isa AbstractPFunction, V.functions)
    if total_ps == total_num
        return AbstractObservable[]
    elseif total_num - total_ps == 1
        f = V.functions[findfirst(fu->!(fu isa AbstractPFunction), V.functions)]
        return differentiateX(f)
    end
    derivatives::AbstractArray{AbstractArray{<:AbstractObservable, 1}, 1} = map(f-> differentiateX(f, limitOrder=limitOrder), V.functions)
    result::AbstractArray{<:AbstractObservable, 1} = AbstractObservable[]
    for derivativeArr in derivatives
        for idx in 1:length(derivativeArr)
            if idx > length(result)
                push!(result, derivativeArr[idx])
            else
                result[idx] = result[idx] + derivativeArr[idx]
            end # if
        end # for idx
    end # derivativeArr
    return result
end # 

function differentiateX(V::Union{ProdFunction, XProdFunction}; limitOrder::Union{Nothing, Int} = nothing)::AbstractArray{<:AbstractObservable, 1}
    if isnothing(limitOrder)
        limitOrder = 10
    end # if
    l = length(V.functions)
    firstDerivative::AbstractObservable = 
        sum(idx -> differentiateX(V.functions[idx], limitOrder=1)[1] * prod(V.functions[1:l .!= idx]), 1:l)
    higherOrder::AbstractArray{<:AbstractObservable, 1} = differentiateX(firstDerivative, limitOrder=limitOrder-1)
    prepend!(higherOrder, firstDerivative)
    return higherOrder
end # 

function differentiateX(V::ScalarProdFunction; limitOrder::Union{Nothing, Int} = nothing)::AbstractArray{<:AbstractObservable, 1}
    return map(f -> ScalarProdFunction(f, V.scalar), differentiateX(V.func, limitOrder=limitOrder))
end # differentiateX

function differentiateX(V::ScalarXProdFunction; limitOrder::Union{Nothing, Int} = nothing)::AbstractArray{<:AbstractXFunction, 1}
    return map(f -> ScalarXProdFunction(f, V.scalar), differentiateX(V.func, limitOrder=limitOrder))
end # differentiateX

function differentiateX(V::Union{ScalarSumFunction, ScalarXSumFunction}; limitOrder::Union{Nothing, Int} = nothing)::AbstractArray{<:AbstractObservable, 1}
    return differentiateX(V.func, limitOrder=limitOrder)
end # differentiateX

function differentiateP1(f::ScalarSumFunction)::AbstractObservable
    return differentiateP1(f.func)
end # differentiateP1

function differentiateP1(f::Union{ScalarProdFunction, ScalarPProdFunction})::AbstractObservable
    return f.scalar * differentiateP1(f.func)
end # differentiateP1

function differentiateP1(f::Union{ProdFunction, PProdFunction})::AbstractObservable
    l = length(f.functions)
    return sum(idx -> differentiateP1(f.functions[idx]) * prod(f.functions[1:l .!= idx]), 1:l)
end # differentiateP1

function differentiateP1(f::Union{SumFunction, PSumFunction})::AbstractObservable
    numXs = sum(func -> func isa AbstractXFunction, f.functions)
    numPs = length(f.functions) - numXs
    if numPs == 0
        return ConstantFunction(0)
    elseif numPs == 1
        pFunc = f.functions[findfirst(func -> !(func isa AbstractXFunction), f.functions)]
        return differentiateP1(pFunc)
    end
    return sum(func -> differentiateP1(func), f.functions)
end # differentiateP1

function _addPolynomialCoefficients(coeff1::AbstractArray{<:Real, 1}, coeff2::AbstractArray{<:Real, 1})::AbstractArray{<:Real, 1}
    l1::Int = length(coeff1)
    l2::Int = length(coeff2)
    if l1 === l2
        return coeff1 + coeff2
    end
    diff::Int = l1 > l2 ? l1 - l2 : l2 - l1
    longer  = l1 > l2 ? coeff1 : coeff2
    shorter = l1 < l2 ? coeff1 : coeff2
    shorter = cat(dims=1, shorter, zeros(diff))
    return longer + shorter
end # _addPolynomialCoefficients

function _multiplyPolynomialCoefficients(coeff1::AbstractArray{<:Real, 1}, coeff2::AbstractArray{<:Real, 1})::AbstractArray{<:Real, 1}
    l1::Int = length(coeff1)
    l2::Int = length(coeff2)
    mx::Int = l1 + l2 - 1
    return map(n -> sum(a -> coeff1[a] * coeff2[n-a+1] * binomial(n-1, a-1), max(1, n-l2+1):min(n, l1)), 1:mx)
end # _multiplyPolynomialCoefficients

#### some utilities ####

# retain only the p-dependent part of an observable (kinetic part)
# only possible for monomials in p OR x and sums thereof
function projectP(::AbstractObservable)::AbstractObservable
    throw(ErrorException("Cannot project to a pure p function"))
end # projectP

function projectX(::AbstractObservable)::AbstractXFunction
    throw(ErrorException("Cannot project to a pure x function"))
end # projectP

function projectP(::AbstractXFunction)::AbstractObservable
    return ConstantFunction()
end # projectP

function projectP(m::AbstractPFunction)::AbstractPFunction
    return m
end # projectP

function projectP(sumF::SumFunction)::AbstractObservable
    return sum(f -> projectP(f), sumF.functions)
end # projectP

function projectP(sumF::ScalarSumFunction)::AbstractObservable
    return projectP(sumF.func)
end # projectP

function projectP(prod::ScalarProdFunction)::AbstractObservable
    return prod.scalar * projectP(prod.func)
end # projectP

function projectX(f::AbstractXFunction)::AbstractXFunction
    return f
end # projectP

function projectX(::AbstractPFunction)::AbstractXFunction
    return ConstantFunction()
end # projectP

function projectX(sumF::SumFunction)::AbstractObservable
    return sum(f -> projectX(f), sumF.functions)
end # projectP

function projectX(sumF::ScalarSumFunction)::AbstractObservable
    return projectX(sumF.func)
end # projectP

function projectX(prod::ScalarProdFunction)::AbstractObservable
    return prod.scalar * projectX(prod.func)
end # projectP

#######

"Create a Hamiltonian observable of the form p^2/2m + V(q)"
function hamiltonian(V::AbstractXFunction; mass::Real = 1)::AbstractObservable
    return SumFunction([PMonomial(2) / (2 * mass), V])
end # hamiltonian

Base.:+(xFunc1::XPolynomial, xFunc2::XPolynomial) = XPolynomial(_addPolynomialCoefficients(xFunc1.coefficients, xFunc2.coefficients))
Base.:+(xFunc1::AbstractXFunction, xFunc2::AbstractXFunction) = XSumFunction([xFunc1, xFunc2])
Base.:+(xFunc1::ConstantFunction, xFunc2::AbstractXFunction) = xFunc1.value == 0 ? xFunc2 : XSumFunction([xFunc1, xFunc2])
Base.:+(xFunc1::AbstractXFunction, xFunc2::ConstantFunction) = Base.:+(xFunc2, xFunc1)
Base.:+(xFunc1::XFunction, xFunc2::XFunction) = #=XSumFunction([xFunc1, xFunc2])=#
    XFunction((x::Real, p::Union{Real, Nothing}=nothing) -> xFunc1.func(x, p) + xFunc2.func(x, p))
Base.:+(func1::AbstractObservable, func2::AbstractObservable) = SumFunction([func1, func2])
Base.:-(func1::AbstractObservable, func2::AbstractObservable) = func1 + (-func2)
Base.:+(xFunc1::ConstantFunction, xFunc2::AbstractObservable) = xFunc1.value == 0 ? xFunc2 : SumFunction([xFunc1, xFunc2])
Base.:+(xFunc1::AbstractObservable, xFunc2::ConstantFunction) = Base.:+(xFunc2, xFunc1)

function Base.:+(xFunc1::SampledXFunction, xFunc2::SampledXFunction)
    if xFunc1.points == xFunc2.points
        return SampledXFunction(xFunc1.points, xFunc1.values + xFunc2.values)
    end
    throw(error("+ not implemented for SampledXFunctions with different domains"))
end # +

function Base.:+(xFunc1::SampledXFunction, xFunc2::AbstractXFunction)
    values2 = xFunc2.(xFunc1.points)
    return SampledXFunction(xFunc1.points, xFunc1.values + values2)
end # +
Base.:+(xFunc1::AbstractObservable, xFunc2::SampledXFunction)=xFunc2 + xFunc1

Base.:+(func1::ConstantFunction, func2::ConstantFunction) = ConstantFunction(func1.value+func2.value)
function Base.:+(func1::ConstantFunction, func2::XPolynomial)
    if func1.value == 0
        return func2
    end
    order = length(func2.coefficients)
    if order == 0
        return func1
    elseif order == 1
        return ConstantFunction(func1.value + func2.coefficients[1])
    end
    coeff = copy(func2.coefficients)
    coeff[1] = coeff[1] + func1.value
    return XPolynomial(coeff)
end
Base.:+(func1::XPolynomial, func2::ConstantFunction) = Base.:+(func2, func1)
Base.:+(func1::AbstractPFunction, func2::AbstractPFunction) = PSumFunction([func1, func2])

Base.:*(xFunc1::AbstractXFunction, xFunc2::AbstractXFunction) = XProdFunction([xFunc1, xFunc2])
Base.:*(xFunc1::XFunction, xFunc2::XFunction) = #=XProdFunction([xFunc1, xFunc2])=#
    XFunction((x::Real, p::Union{Real, Nothing}=nothing) -> xFunc1.func(x, p) * xFunc2.func(x, p))
Base.:*(xFunc1::XPolynomial, xFunc2::XPolynomial) = XPolynomial(_multiplyPolynomialCoefficients(xFunc1.coefficients, xFunc2.coefficients))
Base.:*(func1::PMonomial, func2::PMonomial) = PMonomial(func1.power + func2.power)
Base.:*(pFunc1::AbstractPFunction, pFunc2::AbstractPFunction) = PProdFunction([pFunc1, pFunc2])
Base.:*(pFunc1::ScalarPProdFunction, pFunc2::ScalarPProdFunction) = ScalarPProdFunction(pFunc1.func*pFunc2.func, pFunc1.scalar*pFunc2.scalar)
Base.:*(func1::Union{SumFunction, XSumFunction, PSumFunction}, func2::Union{SumFunction, XSumFunction, PSumFunction}) = sum(f -> sum(g -> f * g, func2.functions), func1.functions)
Base.:*(func1::Union{SumFunction, XSumFunction}, func2::AbstractObservable) = sum(f -> f * func2, func1.functions)
Base.:*(func1::AbstractObservable, func2::Union{SumFunction, XSumFunction, PSumFunction}) = Base.:*(func2, func1)
Base.:*(func1::ScalarProdFunction, func2::AbstractObservable) = ScalarProdFunction(func1.func * func2, func1.scalar)
Base.:*(func1::ScalarPProdFunction, func2::AbstractPFunction) = ScalarPProdFunction(func1.func * func2, func1.scalar)
Base.:*(func1::ScalarXProdFunction, func2::AbstractXFunction) = ScalarXProdFunction(func1.func * func2, func1.scalar)
Base.:*(func1::AbstractObservable, func2::ScalarProdFunction) = Base.:*(func2, func1)
Base.:*(func1::AbstractObservable, func2::ScalarPProdFunction) = Base.:*(func2, func1)
Base.:*(func1::AbstractObservable, func2::ScalarXProdFunction) = Base.:*(func2, func1)

# the tricky case: x*p
Base.:*(func1::PMonomial, func2::AbstractXFunction) = PMonomialXFunction(func1, func2)
Base.:*(func1::AbstractXFunction, func2::PMonomial) = PMonomialXFunction(func2, func1)
Base.:*(func1::PMonomialXFunction, func2::AbstractXFunction) = PMonomialXFunction(func1.P, func1.V * func2)
Base.:*(func1::AbstractXFunction, func2::PMonomialXFunction) = Base.:*(func2, func1)
Base.:*(func1::PMonomialXFunction, func2::PMonomial) = PMonomialXFunction(func1.P * func2, func1.V)
Base.:*(func1::PMonomial, func2::PMonomialXFunction) = Base.:*(func2, func1)
Base.:*(func1::PMonomialXFunction, func2::PMonomialXFunction) = PMonomialXFunction(func1.P * func2.P, func1.V * func2.V)
# Note that a matrix representation for a generic ProdFunction is not defined here, which is why we define all those specific multiplications above
Base.:*(func1::AbstractObservable, func2::AbstractObservable) = ProdFunction([func1, func2])
function Base.:*(func1::ConstantFunction, func2::AbstractObservable)
    if func1.value == 0
        return ConstantFunction()
    end
    return Base.:*(func1.value, func2)
end # *
Base.:*(func1::AbstractObservable, func2::ConstantFunction) = Base.:*(func2, func1)
Base.:*(func1::ConstantFunction, func2::ConstantFunction) = ConstantFunction(func1.value*func2.value)

Base.:-(func::AbstractObservable) = -1 * func

Base.:*(scalar::Real, func::AbstractObservable) = ScalarProdFunction(func, scalar)
Base.:*(scalar::Real, func::AbstractXFunction) = ScalarXProdFunction(func, scalar)
Base.:*(scalar::Real, func::AbstractPFunction) = ScalarPProdFunction(func, scalar)
Base.:*(func::AbstractObservable, scalar::Real) = Base.:*(scalar, func)
Base.:/(func::AbstractObservable, scalar::Real) = Base.:*(1/scalar, func)
Base.:*(scalar::Real, func::XFunction) = #=ScalarXProdFunction(func, scalar)=#
    XFunction((x::Real, p::Union{Real, Nothing}=nothing) -> func.func(x, p) * scalar)
Base.:*(scalar::Real, func::XPolynomial) = XPolynomial(scalar * func.coefficients)
Base.:*(scalar::Real, func::SampledXFunction) = SampledXFunction(func.points, scalar*func.values)
Base.:*(scalar::Real, func::XDerivative) = XDerivative(scalar * func.baseFunction, func.diffOrder)
Base.:*(scalar::Real, func::ConstantFunction) = ConstantFunction(scalar * func.value)
Base.:*(scalar::Real, func::SumFunction) = SumFunction((f-> scalar * f, func.functions))
Base.:*(scalar::Real, func::XSumFunction) = XSumFunction((f-> scalar * f, func.functions))
Base.:*(scalar::Real, func::PSumFunction) = PSumFunction((f-> scalar * f, func.functions))

###### export ####

export AbstractObservable, AbstractXFunction, XPolynomial, XFunction, SampledXFunction, ConstantFunction,
    PMonomial, 
    #PMonomialXFunction, SumFunction, XSumFunction, ProdFunction, XProdFunction, XDerivative,  # mainly used internally
    differentiateX, differentiateP1, hamiltonian
