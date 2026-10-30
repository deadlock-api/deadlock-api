use crate::{Token, TokenKind, Tokenizer, VarTypeError};

/// Most templates, arrays and pointers one type may wrap, counted over the whole type. A live
/// match's send tables use at most two; the nested `Expr` is built, dropped and walked
/// recursively, so an unbounded one from a broken send table would overflow the stack and abort
/// the process.
pub(crate) const MAX_NESTING: usize = 32;

#[derive(Debug, PartialEq, Eq, Clone)]
pub enum Lit<'a> {
    Str(&'a str),
    Num(usize),
}

#[derive(Debug, PartialEq, Eq, Clone)]
pub enum Expr<'a> {
    Ident(&'a str),
    Lit(Lit<'a>),
    Pointer(Box<Self>),
    Template { expr: Box<Self>, arg: Box<Self> },
    Array { expr: Box<Self>, len: Box<Self> },
}

#[derive(Debug, Clone)]
struct Parser<'a> {
    tokenizer: Tokenizer<'a>,
    prev_token: Option<Token<'a>>,
    wraps: usize,
}

impl<'a> Parser<'a> {
    const fn new(input: &'a str) -> Self {
        Self {
            tokenizer: Tokenizer::new(input),
            prev_token: None,
            wraps: 0,
        }
    }

    /// Counts one more template, array or pointer around an expression.
    const fn wrap(&mut self) -> Result<(), VarTypeError> {
        self.wraps = self.wraps.saturating_add(1);
        if self.wraps > MAX_NESTING {
            return Err(VarTypeError::TooDeep);
        }
        Ok(())
    }

    fn next_token(&mut self) -> Result<Option<Token<'a>>, VarTypeError> {
        if let Some(token) = self.prev_token.take() {
            Ok(Some(token))
        } else {
            self.tokenizer.next().transpose()
        }
    }

    fn expect_token<F>(&mut self, f: F) -> Result<Token<'a>, VarTypeError>
    where
        F: FnOnce(&TokenKind<'a>) -> bool,
    {
        match self.next_token()? {
            Some(token) if f(&token.kind) => Ok(token),
            Some(token) => Err(VarTypeError::UnexpectedToken(token.span.start)),
            None => Err(VarTypeError::UnexpectedEof),
        }
    }

    fn parse(&mut self) -> Result<Expr<'a>, VarTypeError> {
        let first = self.next_token()?.ok_or(VarTypeError::UnexpectedEof)?;
        let TokenKind::Ident(ident) = first.kind else {
            return Err(VarTypeError::UnexpectedToken(first.span.start));
        };
        let mut expr = Expr::Ident(ident);
        while let Some(next) = self.next_token()? {
            match next.kind {
                TokenKind::LAngle => {
                    self.wrap()?;
                    let arg = self.parse()?;
                    self.skip_extra_template_args()?;

                    let _rangle = self.expect_token(|k| matches!(k, TokenKind::RAngle))?;
                    expr = Expr::Template {
                        expr: Box::new(expr),
                        arg: Box::new(arg),
                    };
                }
                TokenKind::LSquare => {
                    self.wrap()?;
                    let identorlit = self.expect_token(|_| true)?;
                    let len = match identorlit.kind {
                        TokenKind::Ident(ident) => Expr::Ident(ident),
                        TokenKind::Lit(lit) => {
                            let num = lit.parse::<usize>().map_err(|source| {
                                VarTypeError::InvalidLength {
                                    at: identorlit.span.start,
                                    source,
                                }
                            })?;
                            Expr::Lit(Lit::Num(num))
                        }
                        _ => return Err(VarTypeError::UnexpectedToken(identorlit.span.start)),
                    };

                    let _rsquare = self.expect_token(|k| matches!(k, TokenKind::RSquare))?;
                    expr = Expr::Array {
                        expr: Box::new(expr),
                        len: Box::new(len),
                    };
                }
                TokenKind::Asterisk => {
                    self.wrap()?;
                    expr = Expr::Pointer(Box::new(expr));
                }
                TokenKind::RAngle | TokenKind::RSquare | TokenKind::Comma => {
                    self.prev_token = Some(next);
                    break;
                }
                _ => return Err(VarTypeError::UnexpectedToken(next.span.start)),
            }
        }

        Ok(expr)
    }

    /// Skips the template arguments after the first one. Since the 2026-10-30 Deadlock update
    /// some vectors name their network var and size in them (`CNetworkUtlVectorBase< EEvent,
    /// NetworkVar_m_vecActiveEvents , -1, int >`); only the element type matters for decoding.
    fn skip_extra_template_args(&mut self) -> Result<(), VarTypeError> {
        while let Some(next) = self.next_token()? {
            if next.kind != TokenKind::Comma {
                self.prev_token = Some(next);
                break;
            }
            let arg = self.next_token()?.ok_or(VarTypeError::UnexpectedEof)?;
            if !matches!(arg.kind, TokenKind::Lit(_)) {
                self.prev_token = Some(arg);
                let _type = self.parse()?;
            }
        }
        Ok(())
    }
}

pub fn parse(input: &str) -> Result<Expr<'_>, VarTypeError> {
    Parser::new(input).parse()
}

#[cfg(test)]
mod tests {
    use expect_test::expect;

    use super::*;

    #[test]
    fn too_deep_nesting_is_an_error() {
        // Each of these overflowed the stack (parsing, dropping or walking the nested Expr).
        let n = 10_000;
        for input in [
            format!("{}B{}", "A<".repeat(n), ">".repeat(n)),
            format!("A{}", "*".repeat(n)),
            format!("A{}", "[1]".repeat(n)),
        ] {
            assert!(matches!(parse(&input), Err(VarTypeError::TooDeep)));
        }
        parse("CNetworkUtlVectorBase< CHandle< CBaseEntity > >").unwrap();
    }

    #[test]
    fn extra_template_args_are_skipped() {
        let nested = parse(
            "CNetworkUtlVectorBase< CNetworkUtlVectorBase< EEvent, NetworkVar_m_vecActiveEvents , -1, int > >",
        )
        .unwrap();
        let plain = parse("CNetworkUtlVectorBase< CNetworkUtlVectorBase< EEvent > >").unwrap();
        assert_eq!(nested, plain);
        parse("A< B, C< D, 2 >, -1 >[3]").unwrap();
        parse("A< B, >").unwrap_err();
        parse("A< B, C").unwrap_err();
    }

    #[test]
    fn unexpected_eof() {
        let result = parse("");
        let expected = expect![["
            Err(
                UnexpectedEof,
            )
        "]];
        expected.assert_debug_eq(&result);
    }

    #[test]
    fn unexpected_token() {
        let result = parse("42");
        let expected = expect![["
            Err(
                UnexpectedToken(
                    0,
                ),
            )
        "]];
        expected.assert_debug_eq(&result);
    }

    #[test]
    fn it_works() {
        const INPUTS: [&str; 5] = [
            "uint64[256]",
            "CDOTAGameManager*",
            "CNetworkUtlVectorBase< CHandle< CBasePlayerController > >",
            "CHandle< CDOTASpecGraphPlayerData >[24]",
            "CDOTA_AbilityDraftAbilityState[MAX_ABILITY_DRAFT_ABILITIES]",
        ];

        let mut outputs: Vec<Result<Expr<'static>, VarTypeError>> =
            Vec::with_capacity(INPUTS.len());

        for input in INPUTS {
            outputs.push(parse(input));
        }

        let expected = expect![[r#"
            [
                Ok(
                    Array {
                        expr: Ident(
                            "uint64",
                        ),
                        len: Lit(
                            Num(
                                256,
                            ),
                        ),
                    },
                ),
                Ok(
                    Pointer(
                        Ident(
                            "CDOTAGameManager",
                        ),
                    ),
                ),
                Ok(
                    Template {
                        expr: Ident(
                            "CNetworkUtlVectorBase",
                        ),
                        arg: Template {
                            expr: Ident(
                                "CHandle",
                            ),
                            arg: Ident(
                                "CBasePlayerController",
                            ),
                        },
                    },
                ),
                Ok(
                    Array {
                        expr: Template {
                            expr: Ident(
                                "CHandle",
                            ),
                            arg: Ident(
                                "CDOTASpecGraphPlayerData",
                            ),
                        },
                        len: Lit(
                            Num(
                                24,
                            ),
                        ),
                    },
                ),
                Ok(
                    Array {
                        expr: Ident(
                            "CDOTA_AbilityDraftAbilityState",
                        ),
                        len: Ident(
                            "MAX_ABILITY_DRAFT_ABILITIES",
                        ),
                    },
                ),
            ]
        "#]];
        expected.assert_debug_eq(&outputs);
    }
}
