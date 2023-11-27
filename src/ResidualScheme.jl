struct CombinedState
    t::Real
    point::AbstractPoint
    # All calculations are based on Phi, the original wave function psi is then obtained by performing the respective transformations
    Phi::AbstractWaveFunction 
    raw"\circ V, the potential part of the Hamiltonian propagator in the residual scheme, changes with time; will be reused in the next iteration" 
    V::Operator
    "Time derivative of the trajectory. Only nothing in the initial state."
    cDot::Union{Point, Nothing}
    hbar::Real
    includeIntegralFactor::Bool
    raw"""
    Only relevant if includeIntegralFactor is true.
    If the trajectory is hamiltonian, then it is given by
        \int_0^t (H(c(\tau)) - 1/2 c^\alpha \partial_\alpha H(c(\tau))) d\tau
    In the more general case, it is 
        \int_0^t (H(c(\tau)) + 1/2 \omega_{\alpha\beta} \dot c^\alpha(\tau) c^\beta(\tau)) d\tau
    """
    phaseIntegral::Real
end # CombinedState

raw"""
Implements the Crank Nicolson integration scheme for the Schrödinger equation in the residual version.
I.e. it includes a numerical solution c(t) of Hamilton's equations, plus a solution of 
(1+i\Delta T/2\hbar(T + V_{t+1}) ) \Phi(t+1) = (1-i\Delta T/2\hbar(T + V_t) ) \Phi(t),
where $V_t = \circ V(q(t))
"""
struct ResidualCrankNicolson <: NumericsScheme
    classicalScheme::ClassicalNumericsScheme
    #config::Config
    "is the classical trajectory Hamiltonian?"
    isTrajectoryHamiltonian::Bool
    function ResidualCrankNicolson(;
            # FIXME here we don't know the mass yet, only in the incarnate method
            classicalScheme::ClassicalNumericsScheme=SymplecticEuler(mass=1),  
            isTrajectoryHamiltonian::Bool=true)
        return new(classicalScheme, isTrajectoryHamiltonian)
    end # constructor
end # ResidualCrankNicolson

function schemeId(scheme::ResidualCrankNicolson)::String
    return "ResidualCrankNicolson"
end

struct ResidualCrankNicolsonPropagator
    scheme::ResidualCrankNicolson
    config::SchroedingerConfig
    deltaT::Real
    hamiltonian::AbstractObservable
    representation::QmRepresentation
    classicalPropagator::ClassicalPropagator
    "The (time-independent) kinetic energy operator"
    T::Operator
    V::AbstractObservable
    "first x derivative"
    VDiff1::Function  # as a function of x
    "first p derivative"
    TDiff1::AbstractObservable
    initialState::CombinedState
    mass::Real
    classicalResolutionFactor::Int
end # ResidualCrankNicolsonPropagator

function incarnate(
        hamiltonian::AbstractObservable,
        representation::QmRepresentation,
        scheme::ResidualCrankNicolson,
        deltaT::Real,
        initialPoint::Point,
        initialWaveFunction::AbstractWaveFunction; # initial \Phi
        t0::Real=0.,
        classicalResolutionFactor::Int=1  # use a higher resolution for the classical propagation than for the quantum one
        )::ResidualCrankNicolsonPropagator
    config::SchroedingerConfig = qmConfig(representation)
    classicalPropagator::ClassicalPropagator = incarnate(hamiltonian, scheme.classicalScheme, deltaT / classicalResolutionFactor)
    VDiff::AbstractArray{<:AbstractXFunction, 1} = differentiateX(hamiltonian, limitOrder=1)  # should project to the potential part of H
    VDiff1 = length(VDiff) > 0 ? VDiff[1] : ConstantFunction(0)
    function VdiffX(x::Real)::Real
        try
           return VDiff1(x)
        catch
            d::XDerivative = VDiff1
            step::Real = deltaX(representation)
            return (d.baseFunction(x + step) - d.baseFunction(x - step))/2/step
        end
    end # diffX

    TDiff1 = differentiateP1(hamiltonian)
    # assuming a quadratic (in p) kinetic term; at this point we could as well use the more general circle operator,
    # but then we'd also have to determine it anew in every step
    # TODO it makes a difference though when we set includeIntegralFactor = false => check if this is considered
    T::Operator = asOperator(projectP(hamiltonian), representation)
    V::AbstractObservable = projectX(hamiltonian) 
    mass::Real = 1/2/projectP(hamiltonian)(Point(0, 1))
    VInitial::Operator = scheme.isTrajectoryHamiltonian ? asCircleOperator(V, initialPoint, representation) :
        # TODO does this depend on the integral factor?
        LinearAlgebra.Diagonal(map(x-> V(x + initialPoint.q), (representation::PositionRepresentation).points)) # XXX assuming PositionRepresentation here
    initialState::CombinedState = CombinedState(t0, initialPoint, initialWaveFunction, 
            VInitial, nothing, config.hbar,  config.includeIntegralFactor, 0.)
    return ResidualCrankNicolsonPropagator(scheme, config, deltaT, hamiltonian, representation, classicalPropagator, 
            T, V, VdiffX, TDiff1, initialState, mass, classicalResolutionFactor)
end # incarnate

function propagateSingleTimestep(
        propagator::ResidualCrankNicolsonPropagator,
        state::Union{CombinedState, Nothing} = nothing
    )::CombinedState
    if isnothing(state)
        state = propagator.initialState
    end # if
    config = propagator.config
    hbar = config.hbar
    # step 1: propagate classical state
    oldPoint::Point = pin(state.point)
    pt::AbstractPoint = oldPoint
    for _ in 1:propagator.classicalResolutionFactor
        pt = propagateSingleTimestep(pt, propagator.classicalPropagator)    
    end
    newPoint0::AbstractPoint = pt
    newPoint::Point = pin(newPoint0)
    isTrajectoryHamiltonian::Bool = propagator.scheme.isTrajectoryHamiltonian
    Vnew::Operator = asCircleOperator(propagator.V, newPoint, propagator.representation)
    Vold::Operator = state.V
    deltaT::Real = propagator.deltaT
    factor::Complex = im*deltaT/2/hbar
    # we need to solve A\tilde\psi_{t+1} = B\tilde\psi_t
    A::Operator = LinearAlgebra.I + factor * (propagator.T + Vnew)
    B::Operator = LinearAlgebra.I - factor * (propagator.T + Vold)
    qDot::Real = (newPoint.q - oldPoint.q) / deltaT
    pDot::Real = (newPoint.p - oldPoint.p) / deltaT
    oldCdot::Point = isnothing(state.cDot) ? Point(qDot, pDot) : state.cDot
    if !isTrajectoryHamiltonian
        hamiltonian1New = newPoint.p / propagator.mass - qDot
        hamiltonian2New = propagator.VDiff1(newPoint.q) + pDot
        hamiltonian1Old = oldPoint.p / propagator.mass - oldCdot.q
        hamiltonian2Old = propagator.VDiff1(oldPoint.q) + oldCdot.p
        corrA = hamiltonian1New * asOperator(PMonomial(1), propagator.representation) +
                hamiltonian2New * asOperator(XPolynomial([0.,1.]), propagator.representation)
        corrB = hamiltonian1Old * asOperator(PMonomial(1), propagator.representation) +
                hamiltonian2Old * asOperator(XPolynomial([0.,1.]), propagator.representation)
        if !config.includeIntegralFactor
            corrA = corrA + (0.5 * newPoint.p * hamiltonian1New + 0.5 * newPoint.q * hamiltonian2New) * LinearAlgebra.I
            corrB = corrB + (0.5 * oldPoint.p * hamiltonian1Old + 0.5 * oldPoint.q * hamiltonian2Old) * LinearAlgebra.I
        end # if
        A = A + factor * corrA
        B = B - factor * corrB    
    end 
    values0::AbstractArray{<:Complex, 1} = values(state.Phi, propagator.representation)
    newValues::AbstractArray{<:Complex, 1} = A \ (B * values0)
    PhiNew::AbstractWaveFunction = asWavefunction(newValues, propagator.representation)
    # calculate phase integral summand if required
    local deltaIntegral::Real
    if !config.includeIntegralFactor
        deltaIntegral = 0
    elseif isTrajectoryHamiltonian
        deltaIntegral = deltaT * (propagator.hamiltonian(newPoint) - 
            0.5*(newPoint.q * propagator.VDiff1(newPoint.q) + newPoint.p * propagator.TDiff1(newPoint)))
    else # non-Hamiltonian case
        deltaIntegral = deltaT * (propagator.hamiltonian(newPoint) + 
            0.5*(newPoint.q * pDot - newPoint.p * qDot))
    end # if
    newIntegral = state.phaseIntegral + deltaIntegral
    newState::CombinedState = CombinedState(state.t + deltaT, newPoint0, PhiNew, Vnew,
            Point(qDot, pDot), state.hbar, state.includeIntegralFactor, newIntegral)
    return newState
end # propagateSingleTimestep

function getPsi(state::CombinedState)::AbstractWaveFunction
    weylTranslated::AbstractWaveFunction = weylTranslate(state.Phi, -state.point, state.hbar)
    if !state.includeIntegralFactor
        return weylTranslated
    end
    return exp(-im/state.hbar*state.phaseIntegral) * weylTranslated
end # getPsi

export CombinedState, ResidualCrankNicolson, ResidualCrankNicolsonPropagator, getPsi
    