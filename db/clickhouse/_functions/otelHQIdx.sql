CREATE FUNCTION otelHQIdx AS (q, counts) -> arrayFirstIndex(c -> (c >= (q * arraySum(counts))), arrayCumSum(counts));
