# below: different types of operators associated to V, and helpers
"
Differentiation as a matrix operator

* 1: forward/Newton (default)
* 0: symmetric/midpoint
* -1: backward
"
function _diffOperator(gridPoints::AbstractRange{<:Real}, order::Int; 
        diffMethod::Int=1)::AbstractArray{<:Real, 2}
    if order == 0
        return LinearAlgebra.I
    end # if
    # In principle we can give a formula that works for all orders, see
    # https://en.wikipedia.org/wiki/Numerical_differentiation#Higher_derivatives
    # It is rather tricky, however, to take into account the boundary conditions, so we do it case by case 
    numPoints::Int = length(gridPoints)
    deltaX::Real = step(gridPoints)
    if (order === 1)  # the first derivative may be calculated in different ways
        # FIXME use ints?
        if (diffMethod === 1)
            diag1 = fill(-1., numPoints)
            diag1[numPoints] = 0.
            M1::AbstractArray{<:Real, 2} = LinearAlgebra.Bidiagonal(diag1, ones(numPoints-1), :U)
            return M1/deltaX
        elseif (diffMethod === 0)
            upper = fill(1., numPoints-1)
            lower = fill(-1., numPoints-1)
            upper[1] = 2.
            lower[numPoints-1] = -2.
            diag2 = fill(0., numPoints)
            diag2[1] = -2.
            diag2[numPoints] = 2.
            M2::AbstractArray{<:Real, 2} = LinearAlgebra.Tridiagonal(lower, diag2, upper)
            return M2/deltaX/2
        elseif (diffMethod === -1)
            diag3 = fill(1., numPoints)
            diag3[0] = 0.
            M3::AbstractArray{<:Real, 2} = LinearAlgebra.Bidiagonal(-ones(numPoints), diag3, :L)
            return M3/deltaX
        end
    elseif (order === 2)
        diagonal::AbstractArray{Float64, 1} = fill(-2., numPoints)
        diagonal[1] = -1.
        diagonal[numPoints] = -1.
        Msquared::AbstractArray{Float64, 2} = LinearAlgebra.Tridiagonal(ones(numPoints-1), diagonal, ones(numPoints-1))
        return Msquared/(deltaX^2)
    end # if
    squares::Int = convert(Int, floor(order / 2))
    M::AbstractArray{<:Real, 2} = _diffOperator(gridPoints, 2, diffMethod=diffMethod)^squares
    return order % 2 === 0 ? M : M * _diffOperator(gridPoints, 1, diffMethod=diffMethod)
end # _diffOperator

"Differentiation as a matrix operator",
function _diffOperator(gridPoints::AbstractArray{<:Real, 1}, order::Int; diffMethod::Int=1)::AbstractArray{<:Real, 2}
    if order == 0
        return LinearAlgebra.I
    end # if
    # this is the case that gridPoints is not equally spaced (is not a range)
    # In principle we can give a formula that works for all orders, see
    # https://en.wikipedia.org/wiki/Numerical_differentiation#Higher_derivatives
    # It is rather tricky, however, to take into account the boundary conditions, so we do it case by case 
    numPoints::Int = length(gridPoints)
    if (order === 1)  # the first derivative may be calculated in different ways
        if (diffMethod === 1)
            upper1 = map(idx -> 1/(gridPoints[idx+1] - gridPoints[idx]), 1:(numPoints-1))
            diag1 = -copy(upper1)
            push!(diag1, 0.)
            return LinearAlgebra.Bidiagonal(diag1, upper1, :U)
        elseif (diffMethod === 0)
            upper2 = map(idx -> 1/(gridPoints[idx+1] - gridPoints[idx-1]), 2:(numPoints-1))
            lower2 = -copy(upper2)
            diag2 = fill(0., numPoints-2)
            firstUpper::Float64 = 1/(gridPoints[2] - gridPoints[1])
            prepend!(upper2, firstUpper)
            prepend!(diag2, -firstUpper)
            lastLower::Float64 = 1/(gridPoints[numPoints] - gridPoints[numPoints-1])
            push!(lower2, -lastLower)
            push!(diag2, lastLower)
            return LinearAlgebra.Tridiagonal(lower2, diag2, upper2)
        elseif (diffMethod === -1)
            diag3 = map(idx -> 1/(gridPoints[idx] - gridPoints[idx-1]), 2:numPoints)
            lower3 = -copy(diag3)
            prepend!(diag3, 0.)
            return LinearAlgebra.Bidiagonal(diag3, lower3, :L)
        end
    elseif (order === 2)
        upperSquare = map(idx -> 1/(gridPoints[idx+1] - gridPoints[idx])/(gridPoints[idx] - gridPoints[idx-1]), 2:(numPoints-1))
        lowerSquare = copy(upperSquare)
        diagSquare  = -2 * copy(upperSquare)
        firstUpperSquare::Real = 1/(gridPoints[2] - gridPoints[1])^2
        prepend!(upperSquare, firstUpperSquare)
        prepend!(diagSquare, -firstUpperSquare)
        lastLowerSquare::Real = 1/(gridPoints[numPoints] - gridPoints[numPoints-1])^2
        push!(lowerSquare, lastLowerSquare)
        push!(diagSquare, -lastLowerSquare)
        return LinearAlgebra.Tridiagonal(lowerSquare, diagSquare, upperSquare)
    end # if
    squares::Int = convert(Int, floor(order / 2))
    M::AbstractArray{<:Real, 2} = _diffOperator(gridPoints, 2, diffMethod=diffMethod)^squares
    return order % 2 === 0 ? M : M * _diffOperator(gridPoints, 1, diffMethod=diffMethod)
end # _diffOperator
