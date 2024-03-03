# SchroedingerNumerics examples

## Content

* [Free particle](#free-particle)
  * [Free Gaussian wave packet](#free-gaussian-wave-packet)
  * [Plane wave](#plane-wave)
* [Harmonic Oscillator](#harmonic-oscillator)
  * [Ground state (QM)](#ground-state-qm)
  * [Coherent state (Classical)](#coherent-state-classical)
  * [Coherent state (QM)](#coherent-state-qm)
  * [Coherent state (QMResidual)](#coherent-state-qmresidual)
* [Morse potential](#morse-potential)
  * [Schrödinger equation](#schrödinger-equation)
  * [Residual representation](#residual-representation)
* [Tunneling](#tunneling)
  * [Residual representation](#residual-representation-1)
  * [Combining different approaches](#combining-different-approaches)
* [Scattering](#scattering)
* [Quartic oscillator](#quartic-oscillator)

## Free particle

### Free Gaussian wave packet

The Schrödinger equation for a free Gaussian wave packet.

```julia
config = SchroedingerConfig(hbar=0.001)
# free particle Hamiltonian (mass=1)
H = PMonomial(2)/2
# Gaussian wave packet of width ~ 0.03
psi0 = PositionWaveFunction(x -> exp(-x^2/2/config.hbar))
rep = PositionRepresentation(range(-0.8, 0.8, step=0.001), config)
steps = 1000   
T = 4 * pi
deltaT=T/steps
systemFree0 = QmSystem(psi0, H, rep, deltaT)
# solve the Schrödinger equation and store results in the specified subfolder 
#     => can be used for visualization later on
trace(systemFree0, steps, folder="results/freeParticle/gaussian")
# store example scenario
#store(systemFree0, "examples/freeParticle/gaussian.json") 
```

### Plane wave

We consider different ways to integrate the time-dependent Schrödinger equation for a plane wave $\psi(t=0, x) = e^{\frac i\hbar p_0 x}$ for some $p_0 \neq 0$. The known exact solution is 

$$ \psi(t,x) =\exp\Big\{ \frac i\hbar \Big( p_0 x - \frac{p_0^2}{2m}t\Big) \Big\} $$

The original Schrödinger equation suffers from boundary reflections, if we use Neumann boundary conditions $\frac\partial{\partial x} \psi |_{\partial \Omega} = 0$:

```julia
p = 1.
mass = 1.
hbar = 1.
T = 4 * pi * mass * hbar / p^2
H = PMonomial(2)/(2*mass)

steps = 1000
deltaT = T / steps
xPeriod = 2*pi*hbar / p
config = SchroedingerConfig(hbar=hbar, includeIntegralFactor=true, firstDerivativeMethod=0)
xmin = -1 - 8 * xPeriod
xmax = -xmin

point0 = Point(0., p)
Phi0 = PositionWaveFunction(x -> 1.)
rep = PositionRepresentation(range(xmin, xmax, length=1001), config)
psi = weylTranslate(Phi0, -point0, hbar)

# For solving in the original Schrödinger equation
systemQm = QmSystem(psi, H, rep, deltaT)
trace(systemQm, steps, folder="results/freeParticle/planeWaveQm")
```

The appropriate residual representation is perfectly adapted to Neumann boundary conditions, on the other hand, since $\Phi$ is constant in this representation anyway:

```julia
# For solving in the residual scheme
# a trajectory at constant speed but staying at the same position all the time
classicalScheme = ExactTrajectory((t::Real) -> point0)
scheme = ResidualCrankNicolson(classicalScheme=classicalScheme, isTrajectoryHamiltonian=false,)
systemRes = QmSystemResidual(point0, Phi0, H, rep, deltaT, scheme=scheme, classicalResolutionFactor=1)
trace(systemRes, steps, folder="results/freeParticle/planeWaveQmResidual")
```

Also prone to boundary problems, the Weyl transformed wave function (without phase integral factor):

```julia
# For solving directly in the Weyl representation over (0, p0)
systemWeyl = QmSystem(psi, H, rep, deltaT, scheme=WeylTransformedScheme(point0))
trace(systemWeyl, steps, folder="results/freeParticle/planeWaveQmWeyl")
```


## Harmonic Oscillator

### Ground state (QM)

Using the default Crank-Nicolson method:

```julia
config = SchroedingerConfig(hbar=0.001)
# using again the harmonic oscillator example from above
H = PMonomial(2)/2 + XPolynomial([0, 0, 1])
# the harmonic oscillator ground state, see e.g. https://en.wikipedia.org/wiki/Quantum_harmonic_oscillator; this a Gaussian with variance \sqrt{\hbar} 
psi0 = PositionWaveFunction(x -> exp(-x^2 / 2/config.hbar))
# introducing a grid with 401 points
rep = PositionRepresentation(range(-0.2, 0.2, step=0.001), config)
steps = 1000   
T = 4 * pi  # the oscillation period of the ground state
deltaT=T/steps   # 1000th part of an oscillation period
systemQm0 = QmSystem(psi0, H, rep, deltaT)
# solve the Schrödinger equation and store results in the specified subfolder 
#     => can be used for visualization later on
trace(systemQm0, steps, folder="results/harmonicOscillator/groundStateQm")
# store example scenario
#store(systemQm0, "examples/harmonicOscillator/groundStateQm.json")
```

### Coherent state (Classical)

Hamilton's equation for a harmonic oscillator. Leading to a circular solution in phase space for our parameters.

```julia
# the initial condition for Hamilton's equations, q=0.6, p=0
q0 = 0.6
startingPoint = Point(q0, 0.) 
# the Hamiltonian, a harmonic oscillator with m=1 and \omega=1
H = PMonomial(2)/2 + XPolynomial([0, 0, 1])
T = 2 * pi  # the oscillation period of the oscillator
steps = 1000
deltaT=T/steps   # deltaT = 1000th part of an oscillation period
system0 = ClassicalSystem(startingPoint, H, deltaT)
# solve the Hamiltonian equations and store results in the specified subfolder 
#     => can be used for visualization later on
trace(system0, steps, folder="results/harmonicOscillator/coherentState" * string(q0) * "Classical")
# store example scenario
#store(system0, "examples/harmonicOscillator/coherentState" * string(q0) * "Classical.json")
```

### Coherent state (QM)

This is an example that does not work well... we are trying to directly integrate the Schrödinger equation in the semiclassical regime, and the chosen grid resolution is too small.

```julia
config = SchroedingerConfig(hbar=0.001)
# using again the harmonic oscillator example from above
H = PMonomial(2)/2 + XPolynomial([0, 0, 1])
q0 = 0.6
psi0 = PositionWaveFunction((x::Real) -> exp(-1/2/config.hbar * (x-q0)^2))
point0 = Point(q0, 0)
T = 2 * pi  # the oscillation period of the classical oscillator
steps = 1000
deltaT=T/steps   # deltaT = 1000th part of an oscillation period
psiRep = PositionRepresentation(range(-q0 - 0.2, q0 + 0.2, step=0.001), config)
systemCoherent0 = QmSystem(psi0, H, psiRep, deltaT)
trace(systemCoherent0, steps + 5, folder="results/harmonicOscillator/coherentState" * string(q0) * "Qm")
# store example scenario
#store(systemCoherent0, "examples/harmonicOscillator/coherentState" * string(q0) * "Qm.json")
```

### Coherent state (QMResidual)

This is a better way to solve the Schrödinger equation in the semi-classical regime, by resorting to the *residual Schrödinger equation*. It is based on a solution of Hamilton's equation and a modified form of Schrödinger's equation.

```julia
config = SchroedingerConfig(hbar=0.001)
# using again the harmonic oscillator example from above
H = PMonomial(2)/2 + XPolynomial([0, 0, 1])
q0 = 0.6
psi0 = PositionWaveFunction((x::Real) -> exp(-1/2/config.hbar * (x-q0)^2))
point0 = Point(q0, 0)
Phi0 = weylTranslate(psi0, point0, config.hbar)
T = 2 * pi  # the oscillation period of the classical oscillator
steps = 1000
deltaT=T/steps   # deltaT = 1000th part of an oscillation period
# here we need to enlarge the grid, because the wave function now oscillates between -1 and 1. The width of the initial wave function remains roughly 0.03, so we keep the step size as before
rep = PositionRepresentation(range(-0.2, 0.2, step=0.001), config)
psiRep = PositionRepresentation(range(-q0 - 0.2, q0 + 0.2, step=0.001), config)
systemResidual0 = QmSystemResidual(point0, Phi0, H, rep, deltaT, psiRepresentation=psiRep, classicalResolutionFactor=100)
trace(systemResidual0, steps + 5, folder="results/harmonicOscillator/coherentState" * string(q0) * "QmResidual")
# store example scenario
#store(systemResidual0, "examples/harmonicOscillator/coherentStateQm" * string(q0) * "Residual.json")
```

## Morse potential 


The Morse potential is 

$$ V(x) = D(1-\exp(-ax))^2 $$

for $a>0$ and $D>0$. It has a minimum in x = 0. The Schrödinger equation for the Morse potential can be solved exactly 
(see [Wikipedia](https://en.wikipedia.org/wiki/Morse_potential)) and it has a finite number of bound states, given by 

$$ N = \Big[\sqrt{\frac{2mD}{a}}\hbar - 1\Big] $$

(the closest integer smaller or equal to the expression in square brackets). Note that the $n$-th derivative of the potential can be determined as

$$ V^{(n)}(x) = (-1)^n 2a^nDe^{-ax}\big[ne^{-ax}-1\big] $$

In the Taylor expansion around 0, the harmonic approximation corresponds to a frequency

$$ \omega = \sqrt{\frac {2a^2D}{m}}. $$

### Schrödinger equation

```julia
# fraction of energy of the dissociation energy assigned to the particle
energyFraction = 0.5
a = 1.
mass = 1.
config = SchroedingerConfig(hbar=0.001)
D = 5000 * a * config.hbar^2/2/mass  # roughly 100 bound states
V_func = (x::Real, p::Union{Real, Nothing}=nothing) -> D * (1. - exp(-a * x))^2
function derivatives(n::Int, x::Real, p::Union{Real, Nothing}=nothing)::Real
    e::Real = exp(-a*x)
    return (-a)^n * 2 * D * e * (n*e - 1)
end # deriv
potential = XFunction(V_func, derivatives)
p0 = -sqrt(2*mass*D*energyFraction)   # momentum such that the kinetic energy equals the dissociation energy times energyFraction
H = PMonomial(2) / (2*mass) + potential
omega = sqrt(2*a^2*D/mass)
deltaT = 2 * pi / omega / 1000
# harmonic ground state at 0
Phi0 = PositionWaveFunction((x::Real) -> exp(-sqrt(mass*D/2)*a/config.hbar * x^2))
point0 = Point(0., p0)
psi0 = weylTranslate(Phi0, -point0, config.hbar)
# a good range depends on the energy fraction
rep = PositionRepresentation(range(-1, 4, step=0.005), config)
systemQmMorse = QmSystem(psi0, H, rep, deltaT)
# store results in a folder, to be used with visualization component
trace(systemQmMorse, 2000, folder="results/morse/energy0.5/qm")
```


### Residual representation

```julia
# fraction of energy of the dissociation energy assigned to the particle
energyFraction = 0.5
a = 1.
mass = 1.
config = SchroedingerConfig(hbar=0.001)
D = 5000 * a * config.hbar^2/2/mass  # roughly 100 bound states
V_func = (x::Real, p::Union{Real, Nothing}=nothing) -> D * (1. - exp(-a * x))^2
function derivatives(n::Int, x::Real, p::Union{Real, Nothing}=nothing)::Real
    e::Real = exp(-a*x)
    return (-a)^n * 2 * D * e * (n*e - 1)
end # deriv
potential = XFunction(V_func, derivatives)
p0 = -sqrt(2*mass*D*energyFraction)   # momentum such that the kinetic energy equals the dissociation energy times energyFraction
H = PMonomial(2) / (2*mass) + potential
omega = sqrt(2*a^2*D/mass)
deltaT = 2 * pi / omega / 1000
# harmonic ground state at 0
Phi0 = PositionWaveFunction((x::Real) -> exp(-sqrt(mass*D/2)*a/config.hbar * x^2))
point0 = Point(0., p0)
# a good range depends on the energy fraction
rep = PositionRepresentation(range(-1.5, 4, step=0.005), config)
psiRep = PositionRepresentation(range(-1, 3, step=0.005), config)
systemResidualMorse = QmSystemResidual(point0, Phi0, H, rep, deltaT, psiRepresentation=psiRep)
# store results in a folder, to be used with visualization component
trace(systemResidualMorse, 2000, folder="results/morse/energy0.5/residual")
```


## Tunneling

We consider a harmonic oscillator potential with a spike added in the origin:

$$ V(x) = \big(1+x^2/2\big) * \big(1 + \tfrac 14 e^{-x^2/2\hbar}\big) - 1 $$ 

Our initial wave function is a coherent state traveling in the harmonic potential away from the spike. The energy of the wave packet is carefully chosen to almost exactly match the height of the spike at the origin (slightly surpassing it). When the wave packet hits the spike for the first time it splits into two, a reflected wave packet and a transmitted one.

### Residual representation

Here we start with the residual representation, which cannot successfully trace the splitting of the wave function. Although initially, after hitting the potential spike, the wave function behaves somewhat as expected, splitting into two parts, one traversing the obstacle and the other being reflected, after some time the classical trajectory *drags* the reflected part of the wave function over to the transmitted side. This is unphysical, the residual representation is prone to such problems when a splitting of the wave function into multiple wave packets takes place. 

```julia
config = SchroedingerConfig(hbar=0.001)
V_func = (x::Real, p::Union{Real, Nothing}=nothing) -> (1+x^2/2) * (1 + 0.25*exp(-x^2/(2*config.hbar))) - 1
V = XFunction(V_func)
H = PMonomial(2)/2 + V
point0 = Point(-0.5, -0.5)
Phi0 = PositionWaveFunction((x::Real) -> exp(-1/2/config.hbar * x^2))
T = 2 * pi  # the oscillation period of the classical oscillator
steps = 1000
deltaT=T/steps   # deltaT = 1000th part of an oscillation period
# here we need to enlarge the grid, because the wave function now oscillates between -1 and 1. The width of the initial wave function remains roughly 0.03, so we keep the step size as before
rep = PositionRepresentation(range(-0.5, 0.5, step=0.001), config)
# The original wave function must be considered on a larger grid; but we do not need a fine resolution for it
psiRep = PositionRepresentation(range(-1.2, 1.2, step=0.005), config)
systemTunnel0 = QmSystemResidual(point0, Phi0, H, rep, deltaT, psiRepresentation=psiRep)
trace(systemTunnel0, 600, folder="results/tunneling/residual")
```

### Combining different approaches

To overcome the problems of the residual scheme we combine different approaches to solving the Schrödinger equation, starting with the residual equation for a semi-classical wave packet, then turning to the ordinary Schrödinger equation when the wave function splits (*quantum tunneling*), and finally setting up two residual equations for the resulting wave packets and summing them up to the final solution.

```julia
config = SchroedingerConfig(hbar=0.001)
V_func = (x::Real, p::Union{Real, Nothing}=nothing) -> (1+x^2/2) * (1 + 0.25*exp(-x^2/(2*config.hbar))) - 1
V = XFunction(V_func)
# using again the harmonic oscillator example from above
H = PMonomial(2)/2 + V
point0 = Point(-0.5, -0.5)
Phi0 = PositionWaveFunction((x::Real) -> exp(-1/2/config.hbar * x^2))
T = 2 * pi  # the oscillation period of the classical oscillator
steps = 1000
deltaT=T/steps   # deltaT = 1000th part of an oscillation period
# here we need to enlarge the grid, because the wave function now oscillates between -1 and 1. The width of the initial wave function remains roughly 0.03, so we keep the step size as before
rep = PositionRepresentation(range(-0.4, 0.4, step=0.001), config)
# The original wave function must be considered on a larger grid; but we do not need a fine resolution for it
psiRep = PositionRepresentation(range(-1.2, 1.2, step=0.005), config)
systemTunnel0 = QmSystemResidual(point0, Phi0, H, rep, deltaT, psiRepresentation=psiRep)
function transition1(system::QmSystemResidual)::AbstractQmSystem
    psi1 = getPsi(system.currentState)
    # for simulating the quantum effects we use a slightly higher resolution here
    psiRep2 = PositionRepresentation(range(-0.5, 0.5, step=0.0004), config)
    systemTunnel2 = QmSystem(psi1, H, psiRep2, deltaT)
    return systemTunnel2
end # transition1
function transition2(system::QmSystem)::AbstractQmSystem
    psiRep2 = representation(system)
    # the wave function after splitting into two wave packets
    psi3 = getPsi(system)
    valuesPsi = values(psi3, psiRep2)
    half = Int((length(psiRep2.points)-1)/2)
    valuesPsiLeft = [idx <= half ? valuesPsi[idx] : idx == half+1 ? valuesPsi[idx]/2 : 0. + 0*im for idx in 1:length(psiRep2.points)]
    valuesPsiRight = [idx > half+1 ? valuesPsi[idx] : idx == half+1 ? valuesPsi[idx]/2 : 0. + 0*im for idx in 1:length(psiRep2.points)]
    psi3Left = asWavefunction(valuesPsiLeft, psiRep2)
    psi3Right = asWavefunction(valuesPsiRight, psiRep2)
    qHat = XPolynomial([0., 1.])
    pHat = PMonomial(1.)
    centerLeftQ = expectationValue(psi3Left, qHat, psiRep2)
    centerRightQ = expectationValue(psi3Right, qHat, psiRep2)
    centerLeftP = expectationValue(psi3Left, pHat, psiRep2)
    centerRightP = expectationValue(psi3Right, pHat, psiRep2)
    centerLeft = Point(centerLeftQ, centerLeftP)
    centerRight = Point(centerRightQ, centerRightP)
    PhiLeft = weylTranslate(psi3Left, centerLeft, config.hbar)
    # TODO add t0?
    systemTunnel3Left = QmSystemResidual(centerLeft, PhiLeft, H, rep, deltaT, psiRepresentation=psiRep)
    PhiRight = weylTranslate(psi3Right, centerRight, config.hbar)
    systemTunnel3Right = QmSystemResidual(centerRight, PhiRight, H, rep, deltaT, psiRepresentation=psiRep)
    return QmSystemSum([systemTunnel3Left, systemTunnel3Right])
end # transition2
systemConcat = QmSystemConcat(systemTunnel0, psiRep, [transition1, transition2], [358, 558])
trace(systemConcat, 900, folder="results/tunneling/concat")

```


## Scattering

This example is similar to the [plane wave](#plane-wave) example above, except that now we place a potential spike at the origin. Again, the ordinary Schrödinger equation with Neumann boundary conditions leads to significant artifacts due to boundary reflections:

```julia
Vfunc = (x::Real, p::Union{Real, Nothing}=nothing) -> x >-1 && x < 1 ? exp(-1/(1-x^2)) : 0. 
# only the first derivative is required, therefore we can set all others to 0
VDiff = (order::Int, x::Real, p::Union{Real, Nothing}=nothing) -> 
    order > 1 ? 0 : x >-1 && x < 1 ? -2*x/(1-x^2)^2*V(x) : 0.
p = 1.
mass = 1.
hbar = 1.
T = 4 * pi * mass * hbar / p^2
#V = XFunction(Vfunc, VDiff)
V = XFunction(Vfunc, VDiff)
H = PMonomial(2)/(2*mass) + V

steps = 1000
deltaT = T / steps
xPeriod = 2*pi*hbar / p
# Using the midpoint rule for calculating first derivatives, otherwise the method becomes unstable
config = SchroedingerConfig(hbar=hbar, includeIntegralFactor=true, firstDerivativeMethod=0)
xmin = -1 - 8 * xPeriod
xmax = -xmin

point0 = Point(0., p)
Phi0 = PositionWaveFunction(x -> 1.)
rep = PositionRepresentation(range(xmin, xmax, length=1001), config)

# For solving the system in the original Schrödinger representation
psi = weylTranslate(Phi0, -point0, hbar)
systemQm = QmSystem(psi, H, rep, deltaT)
trace(systemQm, steps, folder="results/scattering/qm")
```

The residual representation does not suffer from the boundary effects, as long as the disturbances from the potential spike do not reach the boundary:

```julia
# a trajectory at constant speed but staying at the same position all the time
classicalScheme = ExactTrajectory((t::Real) -> point0)
# For solving in the residual scheme over constant trajectory (0, p0)
scheme = ResidualCrankNicolson(classicalScheme=classicalScheme, isTrajectoryHamiltonian=false,)
systemScattering = QmSystemResidual(point0, Phi0, H, rep, deltaT, scheme=scheme, classicalResolutionFactor=1)
trace(systemScattering, steps, folder="results/scattering/qmResidual")
```

## Quartic oscillator

Here we consider a quartic oscillator, with potential

$$ V(x) = \frac 12 x^2 + \frac{\alpha}{24} x^4.  $$

```julia
q0 = 0.6
alpha = 4
config = SchroedingerConfig(hbar=0.001)
# V(x) = 1/2 x^2 + 1/24 x^4
H = PMonomial(2)/2 + XPolynomial([0, 0, 1, 0, alpha])
# starting with a coherent state
point0 = Point(0, q0)
Phi0 = PositionWaveFunction((x::Real) -> exp(-1/2/config.hbar * x^2))
T = 2 * pi  # the oscillation period of the classical oscillator
steps = 1000
deltaT=T/steps   # deltaT = 1000th part of an oscillation period
# here we need to enlarge the grid, because the wave function now oscillates between -1 and 1. The width of the initial wave function remains roughly 0.03, so we keep the step size as before
#xbound = alpha < 3 ? 0.2 : 0.3
xbound = 0.2  # ok for one period
rep = PositionRepresentation(range(-xbound, xbound, step=0.001), config)
# The original wave function must be considered on a larger grid; but we do not need a fine resolution for it
psiRep = PositionRepresentation(range(- q0- 0.2, q0 + 0.2, step=0.001), config)
systemResidual0 = QmSystemResidual(point0, Phi0, H, rep, deltaT, psiRepresentation=psiRep, classicalResolutionFactor=100)
# solve both Hamilton's equations and the residual Schrödinger equation and store results in the specified subfolder 
#     => can be used for visualization later on
trace(systemResidual0, steps, folder="results/quarticOscillator/coherentState " * string(q0) *  "QmResidual_" * string(alpha))
```

