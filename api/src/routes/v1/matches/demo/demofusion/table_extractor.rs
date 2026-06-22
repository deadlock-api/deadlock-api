//! Extract table names from SQL queries.
//!
//! Uses `DataFusion`'s SQL parser to identify all table references in a query,
//! enabling automatic schema discovery for those entity types.

use datafusion::sql::sqlparser::ast::{
    Query, Select, SetExpr, Statement, TableFactor, TableWithJoins,
};
use datafusion::sql::sqlparser::dialect::GenericDialect;
use datafusion::sql::sqlparser::parser::Parser;

use super::error::{Error, Result};

/// Extract all table names referenced in a SQL query.
///
/// This walks the SQL AST to find all table references, including:
/// - Simple FROM clauses
/// - JOINs
/// - Subqueries
/// - UNION operands
/// - CTEs (WITH clauses)
///
/// # Example
///
/// ```ignore
/// let tables = extract_table_names(
///     "SELECT * FROM CCitadelPlayerPawn WHERE tick > 1000
///      UNION ALL
///      SELECT * FROM CNPC_Trooper"
/// )?;
/// assert_eq!(tables, vec!["CCitadelPlayerPawn", "CNPC_Trooper"]);
/// ```
pub(super) fn extract_table_names(sql: &str) -> Result<Vec<String>> {
    let dialect = GenericDialect {};
    let statements = Parser::parse_sql(&dialect, sql)
        .map_err(|e| Error::Schema(format!("SQL parse error: {e}")))?;

    let mut tables = Vec::new();
    for stmt in statements {
        if let Statement::Query(query) = stmt {
            extract_from_query(&query, &mut tables);
        }
    }

    // Deduplicate and sort
    tables.sort();
    tables.dedup();
    Ok(tables)
}

fn extract_from_query(query: &Query, tables: &mut Vec<String>) {
    // Handle CTEs (WITH clause)
    if let Some(ref with) = query.with {
        for cte in &with.cte_tables {
            extract_from_query(&cte.query, tables);
        }
    }

    // Handle body (SELECT, UNION, etc.)
    extract_from_set_expr(&query.body, tables);
}

fn extract_from_set_expr(expr: &SetExpr, tables: &mut Vec<String>) {
    match expr {
        SetExpr::Select(select) => {
            extract_from_select(select, tables);
        }
        SetExpr::SetOperation { left, right, .. } => {
            extract_from_set_expr(left, tables);
            extract_from_set_expr(right, tables);
        }
        SetExpr::Query(query) => {
            extract_from_query(query, tables);
        }
        SetExpr::Table(table) => {
            if let Some(name) = &table.table_name {
                tables.push(name.clone());
            }
        }
        _ => {}
    }
}

fn extract_from_select(select: &Select, tables: &mut Vec<String>) {
    for table_with_joins in &select.from {
        extract_from_table_with_joins(table_with_joins, tables);
    }
}

fn extract_from_table_with_joins(twj: &TableWithJoins, tables: &mut Vec<String>) {
    extract_from_table_factor(&twj.relation, tables);
    for join in &twj.joins {
        extract_from_table_factor(&join.relation, tables);
    }
}

fn extract_from_table_factor(factor: &TableFactor, tables: &mut Vec<String>) {
    match factor {
        TableFactor::Table { name, .. } => {
            // Convert ObjectName to simple string (use the last part for schema-qualified names)
            let table_name = name
                .0
                .last()
                .and_then(|part| part.as_ident())
                .map(|ident| ident.value.clone())
                .unwrap_or_default();
            if !table_name.is_empty() {
                tables.push(table_name);
            }
        }
        TableFactor::Derived { subquery, .. } => {
            extract_from_query(subquery, tables);
        }
        TableFactor::NestedJoin {
            table_with_joins, ..
        } => {
            extract_from_table_with_joins(table_with_joins, tables);
        }
        TableFactor::Pivot { table, .. }
        | TableFactor::Unpivot { table, .. }
        | TableFactor::MatchRecognize { table, .. } => {
            extract_from_table_factor(table, tables);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_select() {
        let tables = extract_table_names("SELECT * FROM CCitadelPlayerPawn").unwrap();
        assert_eq!(tables, vec!["CCitadelPlayerPawn"]);
    }

    #[test]
    fn test_union() {
        let tables = extract_table_names(
            "SELECT tick FROM CCitadelPlayerPawn
             UNION ALL
             SELECT tick FROM CNPC_Trooper",
        )
        .unwrap();
        assert_eq!(tables, vec!["CCitadelPlayerPawn", "CNPC_Trooper"]);
    }

    #[test]
    fn test_join() {
        let tables = extract_table_names(
            "SELECT a.tick, b.entity_index
             FROM CCitadelPlayerPawn a
             JOIN CCitadelPlayerController b ON a.entity_index = b.entity_index",
        )
        .unwrap();
        assert_eq!(
            tables,
            vec!["CCitadelPlayerController", "CCitadelPlayerPawn"]
        );
    }

    #[test]
    fn test_subquery() {
        let tables =
            extract_table_names("SELECT * FROM (SELECT tick FROM CCitadelPlayerPawn) AS sub")
                .unwrap();
        assert_eq!(tables, vec!["CCitadelPlayerPawn"]);
    }

    #[test]
    fn test_cte() {
        let tables = extract_table_names(
            "WITH ranked AS (
                SELECT tick, entity_index FROM CCitadelPlayerPawn
             )
             SELECT * FROM ranked",
        )
        .unwrap();
        // The CTE name (`ranked`) is referenced in the outer query, so it is also extracted.
        assert_eq!(tables, vec!["CCitadelPlayerPawn", "ranked"]);
    }

    #[test]
    fn test_deduplication() {
        let tables = extract_table_names(
            "SELECT * FROM CCitadelPlayerPawn
             UNION ALL
             SELECT * FROM CCitadelPlayerPawn",
        )
        .unwrap();
        assert_eq!(tables, vec!["CCitadelPlayerPawn"]);
    }

    #[test]
    fn test_with_where_clause() {
        let tables = extract_table_names(
            "SELECT tick, entity_index FROM CCitadelPlayerPawn WHERE tick < 1000",
        )
        .unwrap();
        assert_eq!(tables, vec!["CCitadelPlayerPawn"]);
    }
}
