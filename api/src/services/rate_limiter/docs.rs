//! Rate limit tables for endpoint descriptions, rendered from the policies the endpoints enforce
//! (and [`DOCUMENTED_DEFAULT`] for those without one), so the docs cannot drift from the code.

use core::fmt::{self, Display};
use core::time::Duration;

use strum::VariantArray as _;

use crate::services::rate_limiter::{Quota, RateLimit, Scope};

/// What the docs state for endpoints without a rate limit of their own. Nothing in the API
/// enforces it.
pub(crate) const DOCUMENTED_DEFAULT: &[Quota] =
    &[Quota::new(Scope::Ip, 100, Duration::from_secs(1))];

/// Appends a `### Rate Limits` table for `limits` to an endpoint description: one policy, or
/// `(label, quotas)` cases for endpoints whose limits depend on the request.
pub(crate) fn describe<'a>(description: &str, limits: impl Into<Limits<'a>>) -> String {
    format!(
        "{}\n\n### Rate Limits:\n{}",
        description.trim_end(),
        limits.into()
    )
}

pub(crate) struct Limits<'a> {
    cases: Vec<Case<'a>>,
    note: Option<&'a str>,
}

/// One labelled policy of [`Limits`] and what its quotas count.
struct Case<'a> {
    label: &'a str,
    quotas: &'a [Quota],
    unit: &'a str,
    /// Quota units per displayed unit.
    divisor: u64,
}

impl<'a> Limits<'a> {
    /// A remark shown above the table.
    pub(crate) fn note(self, note: &'a str) -> Self {
        Self {
            note: Some(note),
            ..self
        }
    }

    /// What the quotas count, for policies charged per unit of cost (default `req`).
    pub(crate) fn unit(mut self, unit: &'a str) -> Self {
        for case in &mut self.cases {
            case.unit = unit;
        }
        self
    }

    /// What the quotas count, shown in units of `divisor` quota units: quotas in core-milliseconds
    /// shown in core-seconds are `.scaled_unit(" core-s", 1000)`.
    pub(crate) fn scaled_unit(mut self, unit: &'a str, divisor: u64) -> Self {
        for case in &mut self.cases {
            case.unit = unit;
            case.divisor = divisor;
        }
        self
    }

    /// [`Self::and`] with the quotas shown in units of `divisor` (see [`Self::scaled_unit`]).
    pub(crate) fn and_scaled(
        mut self,
        label: &'a str,
        limit: RateLimit<'a>,
        unit: &'a str,
        divisor: u64,
    ) -> Self {
        self.cases.push(Case {
            label,
            quotas: limit.quotas,
            unit,
            divisor,
        });
        self
    }

    /// Adds `limit` as one more labelled case counting `unit`, for endpoints charged against
    /// several policies at once.
    pub(crate) fn and(mut self, label: &'a str, limit: RateLimit<'a>, unit: &'a str) -> Self {
        self.cases.push(Case {
            label,
            quotas: limit.quotas,
            unit,
            divisor: 1,
        });
        self
    }
}

impl<'a> From<RateLimit<'a>> for Limits<'a> {
    fn from(limit: RateLimit<'a>) -> Self {
        limit.quotas.into()
    }
}

impl<'a> From<&'a [Quota]> for Limits<'a> {
    fn from(quotas: &'a [Quota]) -> Self {
        [("", quotas)].into()
    }
}

impl<'a, const N: usize> From<[(&'a str, &'a [Quota]); N]> for Limits<'a> {
    fn from(cases: [(&'a str, &'a [Quota]); N]) -> Self {
        Self {
            cases: cases
                .into_iter()
                .map(|(label, quotas)| Case {
                    label,
                    quotas,
                    unit: "req",
                    divisor: 1,
                })
                .collect(),
            note: None,
        }
    }
}

impl Display for Limits<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(note) = self.note {
            writeln!(f, "> {note}\n")?;
        }
        writeln!(f, "| Type | Limit |")?;
        writeln!(f, "| ---- | ----- |")?;
        for &scope in Scope::VARIANTS {
            write!(f, "| {} | ", scope.as_str())?;
            for (i, case) in self.cases.iter().enumerate() {
                if i > 0 {
                    f.write_str("<br>")?;
                }
                if !case.label.is_empty() {
                    write!(f, "{}: ", case.label)?;
                }
                let mut quotas = case.quotas.iter().filter(|q| q.scope == scope).peekable();
                if quotas.peek().is_none() {
                    f.write_str("-")?;
                }
                for (j, quota) in quotas.enumerate() {
                    if j > 0 {
                        f.write_str(", ")?;
                    }
                    let limit = quota.limit.checked_div(case.divisor).unwrap_or(quota.limit);
                    write!(f, "{limit}{}/{}", case.unit, Period(quota.period))?;
                }
            }
            writeln!(f, " |")?;
        }
        Ok(())
    }
}

/// A period in the largest whole unit: `s`, `10s`, `min`, `30min`, `h`, `24h`.
struct Period(Duration);

impl Display for Period {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let secs = self.0.as_secs();
        let (count, unit) = [(3600, "h"), (60, "min")]
            .into_iter()
            .find_map(|(unit, name)| {
                let count = secs.checked_div(unit).filter(|&n| n > 0)?;
                secs.is_multiple_of(unit).then_some((count, name))
            })
            .unwrap_or((secs, "s"));
        if count != 1 {
            write!(f, "{count}")?;
        }
        f.write_str(unit)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn periods_use_the_largest_whole_unit() {
        let fmt = |secs| Period(Duration::from_secs(secs)).to_string();
        assert_eq!(fmt(1), "s");
        assert_eq!(fmt(10), "10s");
        assert_eq!(fmt(60), "min");
        assert_eq!(fmt(90), "90s");
        assert_eq!(fmt(1800), "30min");
        assert_eq!(fmt(3600), "h");
        assert_eq!(fmt(86_400), "24h");
    }

    #[test]
    fn renders_one_policy() {
        const LIMIT: RateLimit = RateLimit::new(
            "test",
            &[
                Quota::new(Scope::Ip, 10, Duration::from_mins(1)),
                Quota::new(Scope::Ip, 100, Duration::from_hours(1)),
                Quota::new(Scope::Global, 2000, Duration::from_hours(1)),
            ],
        );
        assert_eq!(
            describe("Text.\n    ", LIMIT),
            "Text.\n\n### Rate Limits:\n| Type | Limit |\n| ---- | ----- |\n\
             | IP | 10req/min, 100req/h |\n| Key | - |\n| Global | 2000req/h |\n"
        );
    }

    #[test]
    fn renders_a_cost_unit() {
        let table = Limits::from(&[Quota::new(Scope::Ip, 10, Duration::from_mins(1))][..])
            .unit(" accounts")
            .to_string();
        assert!(table.contains("| IP | 10 accounts/min |"));
    }

    #[test]
    fn renders_a_scaled_cost_unit() {
        let table = Limits::from(&[Quota::new(Scope::Ip, 7_200_000, Duration::from_hours(1))][..])
            .scaled_unit(" core-s", 1000)
            .to_string();
        assert!(table.contains("| IP | 7200 core-s/h |"), "{table}");
    }

    #[test]
    fn renders_labelled_cases() {
        let table = Limits::from([
            ("From DB", DOCUMENTED_DEFAULT),
            (
                "From Steam",
                &[Quota::new(Scope::Key, 5, Duration::from_hours(1))][..],
            ),
        ])
        .to_string();
        assert!(table.contains("| IP | From DB: 100req/s<br>From Steam: - |"));
        assert!(table.contains("| Key | From DB: -<br>From Steam: 5req/h |"));
    }

    #[test]
    fn renders_policies_with_their_own_units() {
        const BUDGET: RateLimit = RateLimit::new(
            "test",
            &[Quota::new(Scope::Ip, 1_000, Duration::from_hours(1))],
        );
        let table = Limits::from([("Requests", DOCUMENTED_DEFAULT)])
            .and("Reads", BUDGET, " MB")
            .to_string();
        assert!(table.contains("| IP | Requests: 100req/s<br>Reads: 1000 MB/h |"));
        assert!(table.contains("| Global | Requests: -<br>Reads: - |"));
    }
}
