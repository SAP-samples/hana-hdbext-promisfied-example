package hdbhelper

import (
	"context"
	"database/sql"
	"fmt"
)

// ExecSQL executes a SQL statement and returns the result as a slice of maps,
// where each map represents a row with column names as keys.
func (db *DB) ExecSQL(ctx context.Context, query string) ([]map[string]any, error) {
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	return scanRowsToMaps(rows)
}

// SchemaCalc resolves schema wildcards:
//   - "**CURRENT_SCHEMA**" → queries the database for the active schema
//   - "*" → "%" (SQL LIKE wildcard)
//   - anything else → returned as-is
func SchemaCalc(ctx context.Context, db *DB, schema string) (string, error) {
	switch schema {
	case "**CURRENT_SCHEMA**":
		return db.CurrentSchema(ctx)
	case "*":
		return "%", nil
	default:
		return schema, nil
	}
}

// ObjectName expands wildcard object names for SQL LIKE patterns:
//   - "" or "*" → "%"
//   - anything else → name + "%"
func ObjectName(name string) string {
	if name == "" || name == "*" {
		return "%"
	}
	return name + "%"
}

// scanRowsToMaps converts sql.Rows into a slice of maps.
func scanRowsToMaps(rows *sql.Rows) ([]map[string]any, error) {
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("hdbhelper: columns: %w", err)
	}

	var results []map[string]any
	for rows.Next() {
		values := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, fmt.Errorf("hdbhelper: scan: %w", err)
		}
		row := make(map[string]any, len(cols))
		for i, col := range cols {
			row[col] = values[i]
		}
		results = append(results, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}
