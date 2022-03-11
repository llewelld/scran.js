import {LayeredSparseMatrix} from "./SparseMatrix.js";

/**
 * Permute a vector to match the row order of a {@linkplain LayeredSparseMatrix}.
 * This is usually applied to annotations that match the original row order,
 * but need to be permuted to be used in computation with a {@linkplain LayeredSparseMatrix}.
 *
 * @param {(LayeredSparseMatrix|Int32Array)} layered - A {@linkplain LayeredSparseMatrix} where the rows are permuted for a more memory-efficient storage order.
 * Alternatively a permutation vector, generated by calling {@linkcode LayeredSparseMatrix#permutation permutation} with `restore: true` (the default).
 * @param {(Array|TypedArray)} values - An array of values where each entry corresponds to a row in the original row order.
 *
 * @return A copy of `values` is returned, permuted so that each entry corresponds to a row of `layered`.
 */
export function permuteVector(layered, values) {
    let copy = values.slice();

    let perm;
    if (layered instanceof LayeredSparseMatrix) {
        perm = layered.permutation({ copy: false });
    } else {
        perm = layered;
    }

    perm.forEach((x, i) => {
        copy[x] = values[i];
    });
    return copy;
}

/**
 * Unpermute a vector to match the original row order.
 * This is usually applied to per-feature results computed from a {@linkplain LayeredSparseMatrix}, 
 * to get results corresponding to the original row order.
 *
 * @param {(LayeredSparseMatrix|Int32Array)} layered - A {@linkplain LayeredSparseMatrix} where the rows are permuted for a more memory-efficient storage order.
 * Alternatively a permutation vector, generated by calling {@linkcode LayeredSparseMatrix#permutation permutation} with `restore: true` (the default).
 * @param {(Array|TypedArray)} values - An array of values where each entry corresponds to a row of `layered` (i.e., including the permutation).
 *
 * @return A copy of `values` is returned, permuted so that each entry corresponds to the original row order.
 */
export function unpermuteVector(layered, values) {
    let copy = values.slice();

    let perm;
    if (layered instanceof LayeredSparseMatrix) {
        perm = layered.permutation({ copy: false });
    } else {
        perm = layered;
    }

    perm.forEach((x, i) => {
        copy[i] = values[x];
    });
    return copy;
}

/**
 * Compute a new permutation vector that modifies a vector to match the row order of a {@linkplain LayeredSparseMatrix}.
 * This is provided as a safety measure to handle changes in the permutation across different versions of the {@linkplain LayeredSparseMatrix} initialization.
 * The assumption is that there are some old results that are ordered to match the row order of an old version of a {@linkplain LayeredSparseMatrix}.
 * Given the old permutation vector, this function will enable applications to update their result vectors to match the row order of a new object.
 *
 * @param {(LayeredSparseMatrix|Int32Array)} layered - A {@linkplain LayeredSparseMatrix} where the rows are permuted for a more memory-efficient storage order.
 * Alternatively a permutation vector, generated by calling {@linkcode LayeredSparseMatrix#permutation permutation} with `restore: true` (the default).
 * @param {TypedArray} old - A permutation vector for an older layered sparse matrix generated from the same dataset as `layered`. 
 * This should have been generated by calling {@linkcode LayeredSparseMatrix#permutation permutation} with `restore: true` (the default).
 *
 * @return `null` if the permutations are the same, in which case no further action is required.
 * Otherwise an `Int32Array` is returned containing a permutation that, when applied to a vector with {@linkcode permuteVector}, 
 * permutes that vector to match the row order of `layered`.
 */
export function updatePermutation(layered, old) {
    let spawnPerm;
    if (layered instanceof LayeredSparseMatrix) {
        if (old.length != layered.numberOfRows()) {
            throw "number of rows in 'layered' should be the same as length of 'old'";
        }
        spawnPerm = () => layered.permutation({ copy: false });
    } else {
        if (old.length != layered.length) {
            throw "length of 'layered' should be the same as length of 'old'";
        }
        spawnPerm = () => layered;
    }

    let same = true;
    for (const [index, val] of spawnPerm().entries()) {
        if (old[index] != val) {
            same = false;
            break;
        }
    }

    // No-op.
    if (same) {
        return null;
    }

    // Figure out which row in the old permutation gets the desired identity.
    // We respawn the permutation just in case there were any allocations.
    let output = old.slice();
    spawnPerm().forEach((x, i) => {
        output[x] = old[i];
    });
    return output;
}
