# SchroedingerNumerics

This package can be used to solve the one-dimensional time-dependent *residual Schrödinger equation*, which is particularly interesting for semi-classical problems. Furthermore, it can be used to solve the original Schrödinger equation, as well as Hamilton's equations for the trajectory of a classical point particle in one dimension.

The quantum solvers use the Crank-Nicolson method for integrating the Schrödinger equation.

[![DOI](https://zenodo.org/badge/724236958.svg)](https://zenodo.org/doi/10.5281/zenodo.10642345)

## Content

* [Installation](#installation)
  * [Install dependencies](#install-dependencies)
* [Usage](#usage)
  * [Preparation](#preparation)
  * [Basic concepts](#basic-concepts)
  * [Systems as simulation containers](#systems-as-simulation-containers)
  * [Visualization](#visualization)
  * [Classical mechanics](#classical-mechanics)
  * [Schrödinger equation](#schrödinger-equation)
  * [Residual Schrödinger equation](#residual-schrödinger-equation)
  * [Storing to and reading from file](#storing-to-and-reading-from-file)
  * [Loading examples](#loading-examples)

See also [Examples.md](./Examples.md).

## Installation

Clone the git repository: 

```shell
git clone git@github.com:cnoelle/schroedinger-numerics.git
```

### Install dependencies

The Julia programming environment is needed: https://julialang.org. Once Julia is installed, the following step needs to be executed once. In a shell, go to this directory and run

```
julia
add Pkg
Pkg.instantiate()
```

## Usage

### Preparation

In a shell, go to the base directory (this dir). Then:

* type `julia` to enter the Julia shell
* type `]` to activate the Julia package mode
* type `activate .` to activate the present environment
* Hit *Backspace* to leave the package mode
* type `using SchroedingerNumerics` to import the library and make it available in the current shell session

### Basic concepts

**Observables**

The generic type for observables, i.e. real functions of two variables `x` (position) and `p` (momentum) is called `AbstractObservable`. Several sub-interfaces and implementations are provided:

* `AbstractXFunction`: interface for observables that depend only on `x`. Note that these functions by convention must accept either a single argument, `x`, or two arguments, `x` and `p`.
  * `XPolynomial <: AbstractXFunction`: A polynomial in `x`, defined by its set of coefficients `[V_0, ..., V_k]` in the expansion `V(x) = V_0 + V_1 x + ... + 1/k! V_k x^k`.
  * `XFunction <: AbstractXFunction`: A generic function `(x,p=nothing) -> f(x)`. The simplest constructor takes only the function itself, but it is also possible to pass a second function for the derivatives of `f`, which is often beneficial if a closed form of the derivatives is known. The signature of the second argument is `(diffOrder::Int, x::Real, p::Union{Real, Nothing}=nothing) -> Real`.
  * `SampledXFunction <: AbstractXFunction`: A function defined by a vector of values at specific points.
* `PMonomial`: a monomial in `p`, defined by its power. Note that while no type for general polynomials in `p` is provided, they can be constructed by adding multiple monomials, e.g. `2 * PMonomial(1) + 3 * PMonomial(3)` for the expression `2p + 3p^3`.

Points in phase space implement the interface `AbstractPoint`, a concrete version is

```julia
struct Point <: AbstractPoint
    q::Real
    p::Real
end
```

The `function pin(p::AbstractPoint)::Point` creates a concrete point from an abstract one. Observables can be added and multiplied, and they can be evaluated on points:

```julia
# a harmonic oscillator:
H = PMonomial(2)/2 + XPolynomial([0, 0, 1])
point = Point(2, 3)
# alternatively, we can call H(point.q, point.p)
H(point)
```

**Configuration**

Some configuration parameters for the quantum simulation are defined in the class `SchroedingerConfig`. All parameters have a default value. 

* `hbar`: Planck's constant. Default value: `0.001`.
* TODO

Create an instance: 

```julia
config = SchroedingerConfig(hbar=0.01)
```

**Wave functions**

The generic type for a wave function is called `AbstractWaveFunction`. Note that wave functions are not time-dependent here, they should be thought of as snapshots at a specific instant of time.
Typical implementations include `PointsWaveFunction` and `PositionWaveFunction`, both defined in position space, the first one by means of sampled values at specific grid points, the second one by a function of a single variable `x`.

```julia
"A wave function defined in position space by its values at a set of fixed points"
struct PointsWaveFunction <: AbstractWaveFunction
    "base points in x coordinates"
    points::AbstractArray{<:Real, 1}
    "values of the wave function at the base points"
    values::AbstractArray{<:Complex, 1}
end # PointsWaveFunction

"A wave function defined in position space by an arbitrary function of one real variable"
struct PositionWaveFunction <: AbstractWaveFunction
    func::Function
end # PositionWaveFunction

```

**Representations**

The generic type of a quantum representation is called `QmRepresentation`.

Only the position space representation is implemented, in a type `PositionRepresentation`. It contains the grid of points for which the simulation is calculated. Example: `rep = PositionRepresentation(range(-100, 100), config)`, for a grid with step size 1 ranging from `-100` to `100`.

Representations can be used to map observables to matrix operators and wave functions to an array of values.

```julia
function asOperator(V::AbstractObservable, representation::QmRepresentation)::Operator

function values(psi::AbstractWaveFunction, representation::QmRepresentation)::AbstractArray{<:Complex, 1}

"The inverse function of values(psi, representation)"
function asWavefunction(values::AbstractArray{<:Number, 1}, representation::QmRepresentation; cacheNorm::Bool = true)::AbstractWaveFunction
```

Here the `Operator` type is a union including `AbstractArray{<:Number, 2}`, it can act on the values obtained from the wave function. 


Once a representation is given, we can also calculate the inner product and the norm squared of wave functions, and the expectation value of an observable on a wave function:

```julia
function innerProduct(psi::AbstractWaveFunction, phi::AbstractWaveFunction, representation::QmRepresentation)::Number

function norm_sqr(psi::AbstractWaveFunction, representation::QmRepresentation)::Real

function expectationValue(psi::AbstractWaveFunction, f::AbstractObservable, representation::QmRepresentation)::Real
```

### Systems as simulation containers

The three types `ClassicalSystem, QmSystem, QmSystemResidual` are the main entry points to a simulation. See examples below ([Classical system](#classical-mechanics), [Quantum system](#schrödinger-equation), [Residual quantum system](#residual-schrödinger-equation)).

In order to record the results at every simulation step the `trace`-function can be used. For example:

```julia
system0::Union{ClassicalSystem, QmSystem, QmSystemResidual} = 
    loadSystem("./examples/harmonicOscillator/coherentStateClassical.json")

# solve the equations of motion for 1000 timesteps and store results
system1 = trace(system0, 1000, folder="./results/mySystem")
```

A set of files containing the simulation results will be created in the specified folder. The exact filenames depend on the type of system that was used (classical, quantum, or residual quantum). For a classical system, two files *settings.json* and *points.csv* are created, with the latter containing the classical trajectory and the observables.

Instead of `trace` there is also a `propagate` method with similar effect, which will also solve the underlying equations of motion (Hamilton, Schrödinger, or both in the residual scheme), but does not record results in files:

```julia
system1 = propagate(system0, 1000)
```

### Visualization

A simple web app for visualizing the results of the simulations is provided in the *viz* folder. It can be run locally and is also available via Github pages: https://cnoelle.github.io/physics/schroedingerviz/ (sometimes causes issues with Firefox, Chrome/Chromium seems to be better supported). In order to view the results of a simulation run recorded with the `trace` function, upload all the files created in the respective folder and click *Upload*.

To run the visualization locally in NodeJS, navigate to the *viz* folder in a shell and install the dependencies once:

```shell
npm install
```

To start the app, run

```shell
npm run start
```

This will spin up a development server, and the app can be accessed in the browser at http://localhost:8080.

You can then upload the files created by a trace operation, see [Systems as simulation containers](#systems-as-simulation-containers) and start the animation.

TODO: how to run in Docker

### Classical mechanics

Here is an example how to integrate Hamilton's equations for the harmonic oscillator. It uses the default symplectic Euler method.

```julia
# the initial condition for Hamilton's equations, q=1, p=0
startingPoint = Point(1., 0.) 
# the Hamiltonian, a harmonic oscillator with m=1 and \omega=1
H = PMonomial(2)/2 + XPolynomial([0, 0, 1])
T = 2 * pi  # the oscillation period of the oscillator
steps = 1000
deltaT=T/steps   # deltaT = 1000th part of an oscillation period
system0 = ClassicalSystem(startingPoint, H, deltaT)
# here we solve the Hamilton's equations for one full oscillation cycle
system1 = propagate(system0, steps)
# Alternatively, we could have recorded the results using trace, for later visualization:
#system1 = trace(system1, steps, folder="results/harmonicOscillator/classical")
endPoint = system1.currentState
# validate the norm preservation (harmonics oscillator trajectories form a circle for our params)
using LinearAlgebra
E0 = H(startingPoint)
E1 = H(endPoint)
# this one should be pretty small
difference = abs(2*(E1-E0)/(E0+E1))
pointsDiff = LinearAlgebra.norm_sqr(endPoint - startingPoint) / LinearAlgebra.norm_sqr(startingPoint)
println("Energy deviation after one oscillation cycle: ", difference, ". E0 = ", E0, ", E1 = ", E1)
println("Points deviation after one oscillation cycle: ", pointsDiff)
```

In this particular example we can even determine the solutions of Hamilton's equations analytically: `q(t) = cos(t), p(t)=-sin(t)`, hence it is possible to compare the above numerical solution to the known exact one:

```julia
c = (t::Real) -> Point(cos(t), -sin(t))
exactScheme = ExactTrajectory(c)
system0Exact = ClassicalSystem(startingPoint, H, deltaT, scheme=exactScheme)
system1Exact = propagate(system0Exact, steps)
endPointExact = system1Exact.currentState
println("Exact propagation end point: ", pin(endPointExact), ", simulated end point: ", endPoint, ", and expected end point=starting point: ", startingPoint)
```

### Schrödinger equation

#### Harmonic oscillator ground state

**Numerical solution**

Below is an example how to solve the standard Schrödinger equation in the position representation, again for the harmonic oscillator. This uses the default CrankNicolson integration scheme.

```julia
config = SchroedingerConfig(hbar=0.001)
# using again the harmonic oscillator example from above
H = PMonomial(2)/2 + XPolynomial([0, 0, 1])
# the harmonic oscillator ground state, see e.g. https://en.wikipedia.org/wiki/Quantum_harmonic_oscillator; this is a Gaussian with variance \sqrt{\hbar} 
psi0 = PositionWaveFunction(x -> exp(-x^2 / 2/config.hbar))
# introducing a grid with 401 points
rep = PositionRepresentation(range(-0.2, 0.2, step=0.001), config)
steps = 1000
T = 4 * pi  # the oscillation period of the ground state
deltaT=T/steps   # 1000th part of an oscillation period
systemQm0 = QmSystem(psi0, H, rep, deltaT)
# here we solve the Schrödinger equation for one full oscillation cycle and store the results for visualization
systemQm1 = trace(systemQm0, steps, folder="results/harmonicOscillator/groundStateQm")
psi1 = systemQm1.currentState
```

**Exact solution**

Since we also know the exact solution in this case, we can compare it as follows:

```julia
# the ground state energy is \hbar\omega/2 
psi0Exact = ExactWaveFunction((t::Real, x::Real) -> exp(-x^2 / 2/config.hbar)*exp(-im/2*t))
systemQm0Exact = QmSystem(psi0Exact, H, rep, deltaT, scheme=ExactPropagation())
# instead of propagate we could also use trace here, recording the results
systemQm1Exact = propagate(systemQm0Exact, steps)
psi1Exact = systemQm1Exact.currentState
psiDiffEx=norm_sqr(psi1-psi1Exact, rep)/norm_sqr(psi1Exact, rep)
println("The deviation from the exact solution is ", psiDiffEx)
```

#### Harmonic oscillator coherent state

The following example using a coherent state solution for the harmonic oscillator demonstrates the difficulties in integrating the Schrödinger equation for semi-classical wave functions directly. In the example we select our wave function to be concentrated at `(q_0, p_0) = (1, 0)` initially, so in perfect analogy to the classical example above. Furthermore, it is the initial condition of a so-called coherent state, which is known to reproduce exactly the classical trajectory in the time evolution of its expectation values `<q>` and `<p>`. 

```julia
config = SchroedingerConfig(hbar=0.001)
# using again the harmonic oscillator example from above
H = PMonomial(2)/2 + XPolynomial([0, 0, 1])
psi0Coherent = PositionWaveFunction((x::Real) -> exp(-1/2/config.hbar * (x-1)^2))
T = 2 * pi  # the oscillation period of the classical oscillator
steps = 1000
deltaT=T/steps   # deltaT = 1000th part of an oscillation period
# here we need to enlarge the grid, because the wave function now oscillates between -1 and 1. The width of the initial wave function remains roughly 0.03, so we keep the step size as before
repCoh = PositionRepresentation(range(-1.2, 1.2, step=0.001), config)
systemCoherent0 = QmSystem(psi0Coherent, H, repCoh, deltaT)
systemCoherent1 = trace(systemCoherent0, steps, folder="results/harmonicOscillator/coherentStateQm")
psi1Coherent = systemCoherent1.currentState
# the observables \hat q and \hat p
q = XPolynomial([0, 1])
p = PMonomial(1)
q0 = expectationValue(psi0Coherent, q, repCoh)
p0 = expectationValue(psi0Coherent, p, repCoh)
q1 = expectationValue(psi1Coherent, q, repCoh)
p1 = expectationValue(psi1Coherent, p, repCoh)
print("After one oscillation period the initial point ($(q0), $(p0)) moved to ($(q1), $(p1))" )
```

We would have expected the points to be equal, but they are not, due to insufficient resolution of our grid. This is an indication of the problems one encounters in the semi-classical value range.

**Exact solution**

```julia
psi0Exact = ExactWaveFunction((t::Real, x::Real) -> 
    exp(-(x-cos(t))^2 / 2/config.hbar)*exp(-im/2*t +im/2/config.hbar*sin(t)*(cos(t)-2x)))
repCohEx = PositionRepresentation(range(-1.2, 1.2, step=0.01), config)
systemQm0Exact = QmSystem(psi0Exact, H, repCohEx, deltaT, scheme=ExactPropagation())
systemCoherent1 = propagate(systemQm0Exact, steps)
psi1CoherentExact = systemCoherent1.currentState
q1Ex = expectationValue(psi1CoherentExact, q, repCoh)
p1Ex = expectationValue(psi1CoherentExact, p, repCoh)
print("After one oscillation period the initial point ($(q0), $(p0)) moved along the exact trajectory to ($(q1Ex), $(p1Ex))" )
```

### Residual Schrödinger equation

Finally, again the harmonic oscillator coherent state example, but this time solved in the residual representation.

#### Harmonic oscillator coherent state

```julia
config = SchroedingerConfig(hbar=0.001)
# using again the harmonic oscillator example from above
H = PMonomial(2)/2 + XPolynomial([0, 0, 1])
# the same wave function as in the coherent state example above
psi0 = PositionWaveFunction((x::Real) -> exp(-1/2/config.hbar * (x-1)^2))
point0 = Point(1, 0)
Phi0 = weylTranslate(psi0, point0, config.hbar)
T = 2 * pi  # the oscillation period of the classical oscillator
steps = 1000
deltaT=T/steps   # deltaT = 1000th part of an oscillation period
# here we need to enlarge the grid, because the wave function now oscillates between -1 and 1. The width of the initial wave function remains roughly 0.03, so we keep the step size as before
rep = PositionRepresentation(range(-0.2, 0.2, step=0.001), config)
# The original wave function must be considered on a larger grid; but we do not need a fine resolution for it
psiRep = PositionRepresentation(range(-1.2, 1.2, step=0.01), config)
systemResidual0 = QmSystemResidual(point0, Phi0, H, rep, deltaT, psiRepresentation=psiRep, classicalResolutionFactor=100)
systemResidual1 = trace(systemResidual0, steps, folder="results/harmonicOscillator/coherentStateQmResidual")
point1 = pin(systemResidual1.currentState.point)
Phi1 = systemResidual1.currentState.Phi
psi1 = getPsi(systemResidual1.currentState)
# the observables \hat q and \hat p
q = XPolynomial([0, 1])
p = PMonomial(1)
q1 = expectationValue(psi1, q, psiRep)
p1 = expectationValue(psi1, p, psiRep)
print("In one classical oscillation period the initial point $(point0) moved along the residual Schrödinger equation to ($(q1), $(p1))" )

```


### Storing to and reading from file

Note: this is about storing a system at one specific timestamp. In order to record the evolution of a system over time see the [`trace` function](#systems-as-simulation-containers) .

**Store system data**

```julia
system::ClassicalSystem = ...
store(system, "./someFolder/classicalSystem.json")
```

Depending on the type of Hamiltonian it may be necessary to provide a set of base points on which the potential is sampled: `store(system, systemFile, range(-100, 100, step=0.2))`. This is not required for polynomials or sampled `x` functions. If the process involves sampling then it is not lossless. For instance, if the potential is defined by a Julia function: `V = XFunction(x -> tanh(x^2))`, then persisting the potential requires selecting some grid points for sampling and only the corresponding values will be stored and recovered.

**Load system data**

```julia
system0::Union{ClassicalSystem, QmSystem, QmSystemResidual} = 
    loadSystem("./someFolder/classicalSystem.json")
# solve the equations of motion for a single timestep
system1 = propagate(system0, 1)
...
```

### Loading examples

A few examples are provided in the subfolder `./examples`, they can be loaded using the `loadSystem` method. For example:

```julia
freeGaussianWavePacket = loadSystem("examples/freeParticle/gaussian.json")
trace(freeGaussianWavePacket, 1000, folder="results/freeParticle/wavePacket")
```

For a more extensive set of examples developed from scratch see [Examples.md](./Examples.md).

