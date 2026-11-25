use syn::meta::ParseNestedMeta;

pub(crate) struct Attributes {
    pub crate_path: syn::Path,
}

impl Default for Attributes {
    fn default() -> Self {
        Self {
            // Note: changing this to `::clickhouse` is likely a breaking change;
            // it's possible that the user has renamed the `clickhouse` package,
            // but then aliased it back to `clickhouse` to fix the derive.
            crate_path: syn::Path::from(syn::Ident::new(
                "clickhouse",
                proc_macro2::Span::call_site(),
            )),
        }
    }
}

impl TryFrom<&[syn::Attribute]> for Attributes {
    type Error = syn::Error;

    fn try_from(attrs: &[syn::Attribute]) -> syn::Result<Self> {
        for attr in attrs {
            if attr.path().is_ident("clickhouse") {
                let mut out = Self::default();

                attr.parse_nested_meta(|meta| parse_nested_meta(&meta, &mut out))?;

                return Ok(out);
            }
        }

        Ok(Self::default())
    }
}

/// Called for each meta-item inside the `#[clickhouse(...)]` attribute.
fn parse_nested_meta(meta: &ParseNestedMeta<'_>, out: &mut Attributes) -> syn::Result<()> {
    // #[clickhouse(crate = "<path>")]
    if meta.path.is_ident("crate") {
        out.crate_path = meta
            // Expect and eat the `=` token
            .value()?
            // Expect a string literal like Serde: https://serde.rs/container-attrs.html#crate
            .parse::<syn::LitStr>()?
            // Parse the literal content as `Path`
            .parse()?;
    } else {
        return Err(meta.error("unexpected `#[clickhouse(...)]` argument"));
    }

    Ok(())
}
