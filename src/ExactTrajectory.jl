struct ExactTrajectory <: ClassicalNumericsScheme
    # A function Real -> Point (time -> phase space)
    f::Any 
end # struct

function schemeId(scheme::ExactTrajectory)::String
    return "ExactTrajectory"
end

struct ExactTrajectoryPropagator <: ClassicalPropagator
    scheme::ExactTrajectory
    deltaT::Real
end # ExactTrajectoryPropagator

function incarnate(hamiltonian::AbstractObservable, 
        scheme::ExactTrajectory, deltaT::Real)::ExactTrajectoryPropagator
    return ExactTrajectoryPropagator(scheme, deltaT)
end #specialize

struct TimedPoint <: AbstractPoint
    q::Real
    p::Real
    t::Real
end # TimedPoint

function pin(point::TimedPoint)::Point
    return Point(point.q, point.p)
end # pin

# propagate time step (classical)
function propagateSingleTimestep(point::AbstractPoint, propagator::ExactTrajectoryPropagator)::TimedPoint
    if !(point isa TimedPoint)
        p = pin(point)
        point = TimedPoint(p.q, p.p, 0.)
    end # if
    newT::Real = point.t + propagator.deltaT
    newPoint::Point = propagator.scheme.f(newT)
    return TimedPoint(newPoint.q, newPoint.p, newT)
end # propagateSingleTimestep

export ExactTrajectory
