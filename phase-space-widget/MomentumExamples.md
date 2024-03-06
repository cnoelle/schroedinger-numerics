
## Harmonic oscillator coherent states

```julia
config = SchroedingerConfig(hbar=0.001)
H = PMonomial(2)/2 + XPolynomial([0, 0, 1])
q0 = 0.6
psi0 = PositionWaveFunction((x::Real) -> exp(-1/2/config.hbar * (x-q0)^2))
point0 = Point(q0, 0)
rep = PositionRepresentation(range(-0.2, 0.2, step=0.001), config)
Phi0 = normalize(sampled(weylTranslate(psi0, point0, config.hbar), rep.points), rep)
T = 2 * pi  # the oscillation period of the classical oscillator
steps = 1000
deltaT=T/steps   # deltaT = 1000th part of an oscillation period
psiRep = PositionRepresentation(range(-q0 - 0.2, q0 + 0.2, step=0.001), config)
psiPRep = MomentumRepresentation(psiRep.points, config)
phiPRep = MomentumRepresentation(rep.points, config)
systemResidual0 = QmSystemResidual(point0, Phi0, H, rep, deltaT, psiRepresentation=psiRep, classicalResolutionFactor=100)
trace(systemResidual0, steps + 5, folder="results/harmonicOscillator/momentum/coherentState" * string(q0) * "QmResidual",
    momentumRepresentationPsi=psiPRep, momentumRepresentationPhi=phiPRep)
```

## Quartic oscillator

Here we consider a quartic oscillator, with potential

$$ V(x) = \frac 12 x^2 + \frac{\alpha}{24} x^4.  $$

```julia
q0 = 4
alpha = 0.2
config = SchroedingerConfig(hbar=1)
H = PMonomial(2)/2 + XPolynomial([0, 0, 1, 0, alpha])
point0 = Point(0, q0)
xbound = 5
rep = PositionRepresentation(range(-xbound, xbound, step=0.01), config)
Phi0 = normalize(sampled(PositionWaveFunction((x::Real) -> exp(-1/2/config.hbar * x^2)), rep.points), rep)
T = 2 * pi  # the oscillation period of the classical oscillator
steps = 1000
deltaT=T/steps   # deltaT = 1000th part of an oscillation period
psiRep = PositionRepresentation(range(- q0 - 3, q0 + 3, step=0.01), config)
psiPRep = MomentumRepresentation(psiRep.points, config)
phiPRep = MomentumRepresentation(rep.points, config)
systemResidual0 = QmSystemResidual(point0, Phi0, H, rep, deltaT, psiRepresentation=psiRep, classicalResolutionFactor=100)
trace(systemResidual0, convert(Int, steps / 4 * 5), folder="results/quarticOscillator/momentum/coherentState" * string(q0) *  "QmResidual_" * string(alpha), momentumRepresentationPsi=psiPRep, momentumRepresentationPhi=phiPRep)
```

## Morse

```julia
# fraction of energy of the dissociation energy assigned to the particle
energyFraction = 0.5
a = 1.
mass = 1.
config = SchroedingerConfig(hbar=1)
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
rep = PositionRepresentation(range(-1.5, 4, step=0.005), config)
psiRep = PositionRepresentation(range(-1, 3, step=0.005), config)
psiPRep = MomentumRepresentation(range(-75, 75, step=0.5), config)
phiPRep = MomentumRepresentation(range(-15, 15, step=0.05), config)
# harmonic ground state at 0
Phi0 = normalize(sampled(PositionWaveFunction((x::Real) -> exp(-sqrt(mass*D/2)*a/config.hbar * x^2)), rep.points), rep)
point0 = Point(0., p0)
systemResidualMorse = QmSystemResidual(point0, Phi0, H, rep, deltaT, psiRepresentation=psiRep)
trace(systemResidualMorse, 2000, folder="results/morse/momentum/energy0.5Residual2_",
        momentumRepresentationPsi=psiPRep, momentumRepresentationPhi=phiPRep)
```

## Free particle

```julia
config = SchroedingerConfig(hbar=1)
# free particle Hamiltonian (mass=1)
H = PMonomial(2)/2
rep = PositionRepresentation(range(-24, 24, step=0.03), config)
repP = MomentumRepresentation(range(-5, 5, step=0.01), config)
psi0 = normalize(sampled(PositionWaveFunction(x -> exp(-x^2/2/config.hbar)), rep.points), rep)

steps = 1000   
T = 4 * pi
deltaT=T/steps
systemFree0 = QmSystem(psi0, H, rep, deltaT)
trace(systemFree0, steps, folder="results/freeParticle/momentum/gaussian2", momentumRepresentation=repP)
```
