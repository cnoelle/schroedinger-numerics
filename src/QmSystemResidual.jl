struct QmSystemResidual <: AbstractQmSystem
    config::SchroedingerConfig
    initialPoint::AbstractPoint
    initialPhi::AbstractWaveFunction
    hamiltonian::AbstractObservable
    propagator::ResidualCrankNicolsonPropagator
    scheme::ResidualCrankNicolson
    deltaT::Real
    # state
    currentState::CombinedState
    psiRepresentation::Union{QmRepresentation,Nothing}
    classicalResolutionFactor::Int
    raw"Note that the initial wave function to be passed is Phi"
    function QmSystemResidual(
                initialPoint::Point, initialPhi::AbstractWaveFunction,
                hamiltonian::AbstractObservable, representation::QmRepresentation,
                deltaT::Real; 
                scheme::ResidualCrankNicolson=ResidualCrankNicolson(),
                psiRepresentation::Union{QmRepresentation,Nothing}=nothing, 
                # use a higher resolution for the classical propagation than for the quantum propagation
                classicalResolutionFactor::Int=100,
                t0::Real=0.)
        propagator::ResidualCrankNicolsonPropagator = incarnate(hamiltonian, representation, 
                scheme, deltaT, initialPoint, initialPhi, t0=t0, classicalResolutionFactor=classicalResolutionFactor)
        return new(qmConfig(representation), initialPoint, initialPhi, hamiltonian, 
                propagator, scheme, deltaT, propagator.initialState, psiRepresentation, classicalResolutionFactor)
    end # QmSystem
    function QmSystemResidual(other::QmSystemResidual, state::CombinedState)
        return new(other.config, other.initialPoint, other.initialPhi,
            other.hamiltonian, other.propagator, other.scheme, other.deltaT, state, other.psiRepresentation,
            other.classicalResolutionFactor)
    end # QmSystem
end # QmSystemHamiltonianGauge

function propagate(system::QmSystemResidual, timeSteps::Int=1)::QmSystemResidual
    for _ in 1:timeSteps
        newState::CombinedState = propagateSingleTimestep(system.propagator, system.currentState)
        system = QmSystemResidual(system, newState)
    end # for k
    return system
end # p

function representation(system::QmSystemResidual)::QmRepresentation
    return system.propagator.representation
end

function getPsi(system::QmSystemResidual)::AbstractWaveFunction
    return getPsi(system.currentState)
end

function trace(system::QmSystemResidual, timeSteps::Int=1000;
        folder::String = "./results",
        momentumRepresentationPsi::Union{MomentumRepresentation, Nothing}=nothing,
        momentumRepresentationPhi::Union{MomentumRepresentation, Nothing}=nothing,
        binary::Bool=false,
        compress::Bool=false) # io::IO
    representation::PositionRepresentation = system.propagator.representation
    if !(representation isa PositionRepresentation)
        throw(ErrorException("Can only handle position space, currently")) # XXX why?
    end # if
    psiRepresentation = isnothing(system.psiRepresentation) ? representation : system.psiRepresentation
    config::SchroedingerConfig = system.config
    points0::AbstractArray{<:Real, 1} = representation.points
    x = XPolynomial([0, 1])
    x2 = XPolynomial([0, 0, 1])
    p = PMonomial(1)
    p2 = PMonomial(2)
    mass::Real = 1/2/system.hamiltonian(Point(0, 1))
    V::Union{Nothing, AbstractObservable} = nothing
    try
        V = projectX(system.hamiltonian)
    catch
    end
    Base.Filesystem.mkpath(folder)
    settingsFile0 = joinpath(folder, "settings.json")
    pointsFile0 = joinpath(folder, "points.csv")
    psiFile0 = joinpath(folder, binary ? "psi.dat" : "psi.csv")
    psiTildeFile0 = joinpath(folder, binary ? "phi.dat" : "phi.csv")
    observablesFile0 = joinpath(folder, "observables.csv")
    observablesQmFile0 = joinpath(folder, "observablesQm.csv")
    psiPFile::Union{String, Nothing} = isnothing(momentumRepresentationPsi) ? nothing : joinpath(folder, binary ? "psiP.dat" : "psiP.csv")
    phiPFile::Union{String, Nothing} = isnothing(momentumRepresentationPsi) ? nothing : joinpath(folder, binary ? "phiP.dat" : "phiP.csv")
    VtFile0 = joinpath(folder, binary ? "V_t.dat" : "V_t.csv")
    if compress
        psiFile0 = psiFile0 * ".gz"
        psiTildeFile0 = psiTildeFile0 * ".gz"
        VtFile0 = VtFile0 * ".gz"
        if !isnothing(psiPFile)
            psiPFile = psiPFile * ".gz"
            phiPFile = phiPFile * ".gz"
        end
    end
    open(settingsFile0, "w") do settingsFile
        _writeSettingsQm(system, settingsFile, points=psiRepresentation.points)
    end # settingsFile
    open(pointsFile0, "w") do filePoints
    #open(psiFile0, "w") do filePsi
    filePsi = open(psiFile0, "w")
    #open(psiTildeFile0, "w") do filePsiTilde 
    filePsiTilde = open(psiTildeFile0, "w")
    open(observablesFile0, "w") do fileObservables
    open(observablesQmFile0, "w") do fileObservablesQm
    #open(VtFile0, "w") do filePotential
    filePotential = open(VtFile0, "w")
    if !isnothing(psiPFile)
        filePsiP = open(psiPFile, "w")
    end
    if !isnothing(phiPFile)
        filePhiP = open(phiPFile, "w")
    end
    if compress
        filePsi = CodecZlib.GzipCompressorStream(filePsi)
        filePsiTilde = CodecZlib.GzipCompressorStream(filePsiTilde)
        filePotential = CodecZlib.GzipCompressorStream(filePotential)
        if !isnothing(psiPFile)
            filePsiP = CodecZlib.GzipCompressorStream(filePsiP)
        end
        if !isnothing(phiPFile)
            filePhiP = CodecZlib.GzipCompressorStream(filePhiP)
        end
    end # 
    if !isnothing(psiPFile)
        _writePointsHeader(filePsiP, momentumRepresentationPsi.points, nothing, binary)
    end
    if !isnothing(phiPFile)
        _writePointsHeader(filePhiP, momentumRepresentationPhi.points, nothing, binary)
    end
        _writePointsHeader(filePsiTilde, points0, nothing, binary)
        _writePointsHeader(filePsi, psiRepresentation.points, nothing, binary) # assume a PositionRepresentation as well
        _writePointsHeader(filePotential, points0, "V", binary)
        write(fileObservables, "x, x^2, p, p^2, E\n")
        write(fileObservablesQm, "x, x^2, p, p^2, E\n")
        write(filePoints, "x, p, E\n")
        for _ in 1:timeSteps
            pnt::Point = pin(system.currentState.point)
            classicalEnergy::Real = pnt.p^2 / 2 / mass + V(pnt.q)
            Phi::AbstractWaveFunction = system.currentState.Phi
            psi::AbstractWaveFunction = getPsi(system.currentState)
            _writePointsLine(filePsiTilde, Phi, representation, binary)
            _writePointsLine(filePsi, psi, psiRepresentation, binary)
            if !isnothing(psiPFile)
                # XXX need to convert the (Weyl) TranslatedWaveFunction into a PointsWaveFunction
                psi = asWavefunction(values(psi, psiRepresentation), psiRepresentation)
                _writePointsLine(filePsiP, psi, momentumRepresentationPsi, binary)
            end
            if !isnothing(phiPFile)
                _writePointsLine(filePhiP, Phi, momentumRepresentationPhi, binary)
            end
            if !isnothing(V)
                _writePotentialLine(filePotential, LinearAlgebra.diag(asCircleOperator(V, pnt, representation)), binary)
            end
            ## The below values would become extremely unreliable in case of high classical contributions (strong oscillations)
            #xVal::Real = expectationValue(psi, x, psiRepresentation)
            #x2Val::Real = expectationValue(psi, x2, psiRepresentation)
            #pVal::Real = expectationValue(psi, p, psiRepresentation)
            #p2Val::Real = expectationValue(psi, p2, psiRepresentation)
            #energy::Real = expectationValue(psi, system.hamiltonian, psiRepresentation)
            xValQm::Real = expectationValue(Phi, x, representation)
            x2ValQm::Real = expectationValue(Phi, x2, representation)
            pValQm::Real = expectationValue(Phi, p, representation)
            p2ValQm::Real = expectationValue(Phi, p2, representation)
            tildeHamiltonian::Operator = asTildeOperator(system.hamiltonian, pnt, representation)
            energyQm::Real = expectationValue(Phi, tildeHamiltonian, representation)
            xVal::Real = pnt.q + xValQm
            x2Val::Real = pnt.q^2 + x2ValQm
            pVal::Real = pnt.p + pValQm
            p2Val::Real = pnt.p^2 + p2ValQm
            energy::Real = energyQm
            # Note: var(X) = x2Val - xVal^2
            write(fileObservablesQm, "$(xValQm), $(x2ValQm), $(pValQm), $(p2ValQm), $(energyQm)\n")
            write(fileObservables, "$(xVal), $(x2Val), $(pVal), $(p2Val), $(energy)\n") 
            write(filePoints, "$(pnt.q), $(pnt.p), $(classicalEnergy)\n")
            system = propagate(system, 1)
        end # for timeSteps
    if !isnothing(psiPFile)
        close(filePsiP)
    end
    if !isnothing(phiPFile)
        close(filePhiP)
    end
    #end # open filePotential
    close(filePotential)
    end # open fileObserservablesQm
    end # open fileObservables
    #end # filePsiTilde
    close(filePsiTilde)
    #end # open filePsi
    close(filePsi)
    end # open filePpoints
    return system
    
end # trace

export QmSystemResidual, propagate, trace
