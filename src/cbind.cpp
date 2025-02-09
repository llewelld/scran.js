#include <emscripten/bind.h>

#include <cstdint>
#include <vector>
#include <stdexcept>
#include <unordered_set>
#include <unordered_map>

#include "parallel.h"
#include "NumericMatrix.h"
#include "utils.h"

#include "tatami/tatami.hpp"

NumericMatrix cbind(int n, uintptr_t mats) {
    if (n == 0) {
        throw std::runtime_error("need at least one matrix to cbind");
    }

    auto mat_ptrs = convert_array_of_offsets<const NumericMatrix*>(n, mats);
    std::vector<std::shared_ptr<const tatami::Matrix<double, int> > > collected;
    collected.reserve(mat_ptrs.size());

    const auto& first = *(mat_ptrs.front());
    size_t NR = first.ptr->nrow();
    collected.push_back(first.ptr);

    for (int i = 1; i < n; ++i) {
        const auto& current = *(mat_ptrs[i]);
        if (current.ptr->nrow() != NR) {
            throw "all matrices to cbind should have the same number of rows";
        }
        collected.push_back(current.ptr);
    }

    return NumericMatrix(tatami::make_DelayedBind<1>(std::move(collected)));
}

NumericMatrix rbind(int n, uintptr_t mats) {
    if (n == 0) {
        throw std::runtime_error("need at least one matrix to cbind");
    }

    auto mat_ptrs = convert_array_of_offsets<const NumericMatrix*>(n, mats);
    std::vector<std::shared_ptr<const tatami::Matrix<double, int> > > collected;
    collected.reserve(mat_ptrs.size());

    const auto& first = *(mat_ptrs.front());
    size_t NC = first.ptr->ncol();
    collected.push_back(first.ptr);

    for (int i = 1; i < n; ++i) {
        const auto& current = *(mat_ptrs[i]);
        if (current.ptr->ncol() != NC) {
            throw "all matrices to rbind should have the same number of columns";
        }
        collected.push_back(current.ptr);
    }

    return NumericMatrix(tatami::make_DelayedBind<0>(std::move(collected)));
}

NumericMatrix cbind_with_rownames(int n, uintptr_t mats, uintptr_t names, uintptr_t indices) {
    if (n == 0) {
        throw std::runtime_error("need at least one matrix to cbind");
    }

    auto mat_ptrs = convert_array_of_offsets<const NumericMatrix*>(n, mats);
    const auto& first = *(mat_ptrs[0]);
    std::vector<std::remove_reference<decltype(first.ptr)>::type> inputs;
    inputs.reserve(n);
    for (int i = 0; i < n; ++i) {
        inputs.push_back(mat_ptrs[i]->ptr);
    }

    auto name_ptrs = convert_array_of_offsets<const int32_t*>(n, names);
    auto out = tatami::bind_intersection<1>(inputs, name_ptrs);

    // Save the direct row indices for the first matrix.
    const auto& idx = out.second;
    auto idptr = reinterpret_cast<int*>(indices);
    std::copy(idx.begin(), idx.end(), idptr);

    return NumericMatrix(std::move(out.first));
}

EMSCRIPTEN_BINDINGS(cbind) {
    emscripten::function("cbind", &cbind);

    emscripten::function("rbind", &rbind);

    emscripten::function("cbind_with_rownames", &cbind_with_rownames);
}
