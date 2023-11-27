
raw"""
Implements the scheme
p_{n+1} = p_n - \Delta t V'(q_n)
q_{n+1} = q_n + \Delta t / m p_{n+1}
"""
struct SymplecticEuler <: ClassicalNumericsScheme
    mass::Real
    "delta for calculating derivatives of the potential; only needed if they cannot be determined otherwise"
    deltaX::Real # may be needed for derivatives calculation; depends on the potential
    function SymplecticEuler(;mass::Real=1, deltaX=0.001)
        return new(mass, deltaX)
    end #constructor
end # SymplecticEuler

function schemeId(scheme::SymplecticEuler)::String
    return "SymplecticEuler"
end

struct SymplecticEulerPropagation <: ClassicalPropagator
    deltaT::Real
    mass::Real
    deltaX::Real
    "A function Float64 -> Float64"
    V_diff::AbstractXFunction
end #

function incarnate(hamiltonian::AbstractObservable, scheme::SymplecticEuler, deltaT::Real)::SymplecticEulerPropagation
    diffs = differentiateX(hamiltonian, limitOrder=1)
    # the empty case seems strange?
    V_diff::AbstractXFunction = isempty(diffs) ? projectX(hamiltonian) : diffs[1]  
    return SymplecticEulerPropagation(deltaT, scheme.mass, scheme.deltaX, V_diff)
end # specialize


function propagateSingleTimestep(point::Point, propagator::SymplecticEulerPropagation)::Point
    deltaT::Real = propagator.deltaT
    local V1::Real
    try 
        V1 = propagator.V_diff(point.q)
    catch
        diff::XDerivative = propagator.V_diff
        if diff.diffOrder > 1
            throw(ErrorException("higher order differentiation not implemented"))
        end
        V1 = (diff.baseFunction(point.q + propagator.deltaX) - diff.baseFunction(point.q - propagator.deltaX)) / 2 / propagator.deltaX
    end 
    p::Real = point.p - deltaT * V1
    q::Real = point.q + deltaT / propagator.mass * p
    return Point(q, p)
end # propagateSingleTimestep

export SymplecticEuler
