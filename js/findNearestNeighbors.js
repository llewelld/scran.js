import * as utils from "./utils.js";
import * as wasm from "./wasm.js";
import { RunPCAResults } from "./runPCA.js";

/** 
 * Wrapper for the neighbor search index on the Wasm heap, typically produced by {@linkcode buildNeighborSearchIndex}.
 * @hideconstructor
 */
export class BuildNeighborSearchIndexResults {
    constructor(raw) {
        this.index = raw;
        return;
    }

    /**
     * @return {number} Number of cells in the index.
     */
    numberOfCells() {
        return this.index.num_obs();
    }

    /**
     * @return {number} Number of dimensions in the index.
     */
    numberOfDims() {
        return this.index.num_dim();
    }

    /**
     * @return Frees the memory allocated on the Wasm heap for this object.
     * This invalidates this object and all references to it.
     */
    free() {
        if (this.index !== null) {
            this.index.delete();
            this.index = null;
        }
        return;
    }
}

/**
 * Build the nearest neighbor search index.
 *
 * @param {(RunPCAResults|Float64WasmArray|Array|TypedArray)} x - Numeric coordinates of each cell in the dataset.
 * For array inputs, this is expected to be in column-major format where the rows are the variables and the columns are the cells.
 * For a {@linkplain RunPCAResults} input, we extract the principal components.
 * @param {object} [options] - Optional parameters.
 * @param {number} [options.numberOfDims=null] - Number of variables/dimensions per cell.
 * Only used (and required) for array-like `x`.
 * @param {number} [options.numberOfCells=null] - Number of cells.
 * Only used (and required) for array-like `x`.
 * @param {boolean} [options.approximate=true] - Whether to build an index for an approximate neighbor search.
 *
 * @return {BuildNeighborSearchIndexResults} Index object to use for neighbor searches.
 */
export function buildNeighborSearchIndex(x, { numberOfDims = null, numberOfCells = null, approximate = true } = {}) {
    var buffer;
    var raw;
    var output;

    try {
        let pptr;

        if (x instanceof RunPCAResults) {
            numberOfDims = x.numberOfPCs();
            numberOfCells = x.numberOfCells();
            let pcs = x.principalComponents({ copy: false });
            pptr = pcs.byteOffset;

        } else {
            if (numberOfDims === null || numberOfCells === null) {
                throw new Error("'numberOfDims' and 'numberOfCells' must be specified when 'x' is an Array");
            }

            buffer = utils.wasmifyArray(x, "Float64WasmArray");
            if (buffer.length != numberOfDims * numberOfCells) {
                throw new Error("length of 'x' must be the product of 'numberOfDims' and 'numberOfCells'");
            }

            pptr = buffer.offset;
        }

        raw = wasm.call(module => module.build_neighbor_index(pptr, numberOfDims, numberOfCells, approximate)); 
        output = new BuildNeighborSearchIndexResults(raw);

    } catch (e) {
        utils.free(raw);
        throw e;

    } finally {
        utils.free(buffer);
    }

    return output;
}

/** 
 * Wrapper for the neighbor search results on the Wasm heap, typically produced by {@linkcode findNearestNeighbors}.
 * @hideconstructor
 */
export class FindNearestNeighborsResults {
    constructor(raw) {
        this.results = raw;
        return;
    }

    /**
     * @return {number} The total number of neighbors across all cells.
     * This is usually the product of the number of neighbors and the number of cells.
     */
    size() {
        return this.results.size();
    }

    /**
     * @return {number} The number of cells used in the search.
     */
    numberOfCells() {
        return this.results.num_obs();
    }

    /**
     * @param {object} [options] - Optional parameters.
     * @param {?Int32WasmArray} [options.runs=null] - A Wasm-allocated array of length equal to `numberOfCells()`,
     * to be used to store the number of neighbors per cell.
     * @param {?Int32WasmArray} [options.indices=null] - A Wasm-allocated array of length equal to `size()`,
     * to be used to store the indices of the neighbors of each cell.
     * @param {?Float64WasmArray} [options.distances=null] - A Wasm-allocated array of length equal to `size()`,
     * to be used to store the distances to the neighbors of each cell.
     *
     * @return {object|undefined} 
     * If all of the arguments are non-`null`, the buffers in `runs`, `indices` and `distances` are filled with their respective contents, and nothing is returned.
     *
     * If all of the arguments are `null`, a object is returned with the `runs`, `indices` and `distances` keys, each with an appropriate TypedArray as the value.
     *
     * Otherwise, an error is raised.
     */
    serialize({ runs = null, indices = null, distances = null } = {}) {
        var copy = (runs === null) + (indices === null) + (distances === null);
        if (copy != 3 && copy != 0) {
            throw new Error("either all or none of 'runs', 'indices' and 'distances' can be 'null'");
        }

        if (copy === 3) {
            var run_data;
            var ind_data;
            var dist_data;
            var output;
            
            try {
                run_data = utils.createInt32WasmArray(this.numberOfCells());
                let s = this.size();
                ind_data = utils.createInt32WasmArray(s);
                dist_data = utils.createFloat64WasmArray(s);
                this.results.serialize(run_data.offset, ind_data.offset, dist_data.offset);

                output = { 
                    "runs": run_data.slice(), 
                    "indices": ind_data.slice(), 
                    "distances": dist_data.slice() 
                };
            } finally {
                utils.free(run_data);
                utils.free(ind_data);
                utils.free(dist_data);
            }

            return output;
        } else {
            this.results.serialize(runs.offset, indices.offset, distances.offset);
        }
    }

    /**
     * @param {Int32WasmArray|Array|TypedArray} runs An array of length equal to `numberOfCells()`,
     * containing the number of neighbors per cell.
     * @param {Int32WasmArray|Array|TypedArray} indices An array of length equal to `size()`,
     * containing the indices of the neighbors of each cell.
     * @param {Float64WasmArray|Array|TypedArray} indices An array of length equal to `size()`,
     * containing the distances to the neighbors of each cell.
     *
     * @return {FindNearestNeighborsResults} Object containing the unserialized search results.
     */
    static unserialize(runs, indices, distances) {
        var raw;
        var output;
        var run_data;
        var ind_data;
        var dist_data;

        try {
            run_data = utils.wasmifyArray(runs, "Int32WasmArray");
            ind_data = utils.wasmifyArray(indices, "Int32WasmArray");
            dist_data = utils.wasmifyArray(distances, "Float64WasmArray");
            raw = wasm.call(module => new module.NeighborResults(runs.length, run_data.offset, ind_data.offset, dist_data.offset));
            output = new FindNearestNeighborsResults(raw);
        } catch (e) {
            utils.free(raw);
            throw e;
        } finally { 
            utils.free(run_data);
            utils.free(ind_data);
            utils.free(dist_data);
        }

        return output;
    }

    /**
     * @return Frees the memory allocated on the Wasm heap for this object.
     * This invalidates this object and all references to it.
     */
    free() {
        if (this.results !== null) {
            this.results.delete();
            this.results = null;
        }
        return;
    }
}

/**
 * Find the nearest neighbors for each cell.
 *
 * @param {NeighborSearchIndex} x The neighbor search index built by {@linkcode buildNeighborSearchIndex}.
 * @param {number} k Number of neighbors to find.
 *
 * @return {FindNearestNeighborsResults} Object containing the search results.
 */
export function findNearestNeighbors(x, k) {
    var raw;
    var output;

    try {
        raw = wasm.call(module => module.find_nearest_neighbors(x.index, k));
        output = new FindNearestNeighborsResults(raw);
    } catch (e) {
        utils.free(raw);
        throw e;
    }

    return output;
}
