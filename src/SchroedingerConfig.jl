"Global configuration options for the numerical simulation"
struct SchroedingerConfig
    "
    Value of Planck's constant, or maybe rather the dimensionless parameter
    \"hbar / characteristic action of the system\"
    "
    hbar::Real
    "
    Defines the convention used for the residual Schrödinger equation:
    include an integral factor in the unitary transformation to eliminate
    the zeroth order contributions from the Hamiltonian or not?
    If this is true (the default), then the conversion from the residual 
    wave function Phi to the original wave function psi needs to include
    a phase consisting of a time-integral, otherwise we get some nasty zeroth-order
    terms in the Hamiltonian.
    Default: true.
    "
    includeIntegralFactor::Bool 
    "
    Derivative method used in the definition of derivative operators, such as
    the momentum operator in position space representation.
    * 1: forward/Newton (default)
    * 0: symmetric/midpoint
    * -1: backward
    "
    firstDerivativeMethod::Int
    "
    Number of derivatives to include in expressions summing over the 
    Tayler series of some function. TODO is it still relevant?
    Default: 10
    "
    limitDiffOrder::Int
    function SchroedingerConfig(;
            hbar::Real=0.001,
            includeIntegralFactor::Bool=true,
            firstDerivativeMethod::Int=1,
            limitDiffOrder::Int=10)
        return new(hbar, includeIntegralFactor, firstDerivativeMethod, limitDiffOrder)
    end # constructor
end # SchroedingerConfig

export SchroedingerConfig
