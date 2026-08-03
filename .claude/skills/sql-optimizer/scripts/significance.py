#!/usr/bin/env python3
"""Welch's t-test for two samples of a metric (e.g. wall_ms, memory_usage).

Usage: significance.py <label_a> <csv_values_a> <label_b> <csv_values_b> [alpha=0.05]

Prints mean/stddev/n for each sample, Welch's t, Welch-Satterthwaite df,
two-tailed p-value, and a SIGNIFICANT yes/no verdict at the given alpha.
Exit code 0 always; parse the printed "significant: true|false" line.
"""

import math
import sys


def mean(xs):
    return sum(xs) / len(xs)


def sample_var(xs):
    m = mean(xs)
    n = len(xs)
    if n < 2:
        return 0.0
    return sum((x - m) ** 2 for x in xs) / (n - 1)


def betacf(a, b, x):
    MAXIT = 200
    EPS = 3e-16
    FPMIN = 1e-300
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < FPMIN:
        d = FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        de = d * c
        h *= de
        if abs(de - 1.0) < EPS:
            break
    return h


def betai(a, b, x):
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    bt = math.exp(
        math.lgamma(a + b)
        - math.lgamma(a)
        - math.lgamma(b)
        + a * math.log(x)
        + b * math.log(1.0 - x)
    )
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * betacf(a, b, x) / a
    return 1.0 - bt * betacf(b, a, 1.0 - x) / b


def t_dist_two_tailed_p(t, df):
    x = df / (df + t * t)
    return betai(df / 2.0, 0.5, x)


def welch_t_test(a, b):
    n1, n2 = len(a), len(b)
    m1, m2 = mean(a), mean(b)
    v1, v2 = sample_var(a), sample_var(b)
    se1, se2 = v1 / n1, v2 / n2
    se = math.sqrt(se1 + se2)
    if se == 0:
        t = 0.0
        df = n1 + n2 - 2
    else:
        t = (m1 - m2) / se
        denom = (se1 ** 2) / (n1 - 1) + (se2 ** 2) / (n2 - 1) if n1 > 1 and n2 > 1 else 1
        df = (se1 + se2) ** 2 / denom if denom != 0 else n1 + n2 - 2
    p = t_dist_two_tailed_p(t, df) if df > 0 else 1.0
    return {
        "mean_a": m1,
        "mean_b": m2,
        "sd_a": math.sqrt(v1),
        "sd_b": math.sqrt(v2),
        "n_a": n1,
        "n_b": n2,
        "t": t,
        "df": df,
        "p": p,
        "pct_change": ((m2 - m1) / m1 * 100.0) if m1 != 0 else float("nan"),
    }


def main():
    if len(sys.argv) < 5:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    label_a, csv_a, label_b, csv_b = sys.argv[1:5]
    alpha = float(sys.argv[5]) if len(sys.argv) > 5 else 0.05
    a = [float(x) for x in csv_a.split(",") if x.strip() != ""]
    b = [float(x) for x in csv_b.split(",") if x.strip() != ""]
    if len(a) < 2 or len(b) < 2:
        print("error: need at least 2 samples per side for a t-test", file=sys.stderr)
        sys.exit(1)
    r = welch_t_test(a, b)
    sig = r["p"] < alpha
    print(f"{label_a}: mean={r['mean_a']:.4g} sd={r['sd_a']:.4g} n={r['n_a']}")
    print(f"{label_b}: mean={r['mean_b']:.4g} sd={r['sd_b']:.4g} n={r['n_b']}")
    print(f"pct_change: {r['pct_change']:+.2f}%")
    print(f"welch_t: {r['t']:.4f}  df: {r['df']:.2f}  p_value: {r['p']:.5f}")
    print(f"significant: {'true' if sig else 'false'}  (alpha={alpha})")
    if not sig:
        print(
            "WARNING: difference is not statistically significant at this alpha — "
            "treat as noise, do not report as a win/regression.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
