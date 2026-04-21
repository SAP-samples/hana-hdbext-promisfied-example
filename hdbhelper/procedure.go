package hdbhelper

import (
	"context"
	"database/sql"
	"fmt"
	"reflect"
	"strings"
)

const sqlProcedureMetadata = `SELECT
	PARAMS.PARAMETER_NAME,
	PARAMS.DATA_TYPE_NAME,
	PARAMS.PARAMETER_TYPE,
	PARAMS.HAS_DEFAULT_VALUE,
	PARAMS.IS_INPLACE_TYPE,
	PARAMS.TABLE_TYPE_SCHEMA,
	PARAMS.TABLE_TYPE_NAME
FROM SYS.PROCEDURE_PARAMETERS AS PARAMS
WHERE PARAMS.SCHEMA_NAME = ? AND PARAMS.PROCEDURE_NAME = ?
ORDER BY PARAMS.POSITION`

// ProcParam describes a single stored procedure parameter.
type ProcParam struct {
	Name            string
	DataType        string
	ParameterType   string // IN, OUT, INOUT
	HasDefault      string
	IsInplace       string
	TableTypeSchema string
	TableTypeName   string
}

// Procedure is a handle to a loaded stored procedure.
type Procedure struct {
	schema string
	name   string
	params []ProcParam
	db     *DB
}

// ProcedureResult holds the output of a stored procedure call.
type ProcedureResult struct {
	OutputScalar map[string]any
	ResultSets   [][]map[string]any
}

// TypedProcedureResult holds stored procedure output with typed result sets.
type TypedProcedureResult[T any] struct {
	OutputScalar map[string]any
	ResultSets   [][]T
}

// LoadProcedure fetches metadata for a stored procedure and returns a
// Procedure handle that can be used with Call or CallTyped.
// If schema is empty, the current connection schema is used.
func (db *DB) LoadProcedure(ctx context.Context, schema, name string) (*Procedure, error) {
	if schema == "" {
		s, err := db.CurrentSchema(ctx)
		if err != nil {
			return nil, fmt.Errorf("hdbhelper: cannot resolve current schema: %w", err)
		}
		schema = s
	}

	rows, err := db.QueryContext(ctx, sqlProcedureMetadata, schema, name)
	if err != nil {
		return nil, fmt.Errorf("hdbhelper: cannot fetch procedure metadata for %s.%s: %w", schema, name, err)
	}
	defer rows.Close()

	var params []ProcParam
	for rows.Next() {
		var p ProcParam
		if err := rows.Scan(&p.Name, &p.DataType, &p.ParameterType, &p.HasDefault, &p.IsInplace, &p.TableTypeSchema, &p.TableTypeName); err != nil {
			return nil, fmt.Errorf("hdbhelper: scan procedure metadata: %w", err)
		}
		params = append(params, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &Procedure{
		schema: schema,
		name:   name,
		params: params,
		db:     db,
	}, nil
}

// Call executes the stored procedure. Input parameters are matched by position
// to IN/INOUT parameters. Output scalar values and table result sets are
// collected into ProcedureResult.
func (p *Procedure) Call(ctx context.Context, inputParams ...any) (*ProcedureResult, error) {
	callSQL, namedArgs, scalarDests, tableDests, err := p.buildCallArgs(inputParams)
	if err != nil {
		return nil, err
	}

	stmt, err := p.db.PrepareContext(ctx, callSQL)
	if err != nil {
		return nil, fmt.Errorf("hdbhelper: prepare CALL %s.%s: %w", p.schema, p.name, err)
	}

	if _, err := stmt.ExecContext(ctx, namedArgs...); err != nil {
		stmt.Close()
		return nil, fmt.Errorf("hdbhelper: exec CALL %s.%s: %w", p.schema, p.name, err)
	}

	result := &ProcedureResult{
		OutputScalar: make(map[string]any, len(scalarDests)),
	}

	for name, dest := range scalarDests {
		result.OutputScalar[name] = *dest
	}

	for _, td := range tableDests {
		mapped, err := scanRowsToMaps(td.rows)
		if err != nil {
			stmt.Close()
			return nil, fmt.Errorf("hdbhelper: scan table output %s: %w", td.name, err)
		}
		result.ResultSets = append(result.ResultSets, mapped)
	}

	stmt.Close()
	return result, nil
}

// CallTyped executes the stored procedure and scans table result sets into
// slices of T. Struct fields are matched to columns by the "db" tag, falling
// back to the field name.
func CallTyped[T any](p *Procedure, ctx context.Context, inputParams ...any) (*TypedProcedureResult[T], error) {
	callSQL, namedArgs, scalarDests, tableDests, err := p.buildCallArgs(inputParams)
	if err != nil {
		return nil, err
	}

	stmt, err := p.db.PrepareContext(ctx, callSQL)
	if err != nil {
		return nil, fmt.Errorf("hdbhelper: prepare CALL %s.%s: %w", p.schema, p.name, err)
	}

	if _, err := stmt.ExecContext(ctx, namedArgs...); err != nil {
		stmt.Close()
		return nil, fmt.Errorf("hdbhelper: exec CALL %s.%s: %w", p.schema, p.name, err)
	}

	result := &TypedProcedureResult[T]{
		OutputScalar: make(map[string]any, len(scalarDests)),
	}

	for name, dest := range scalarDests {
		result.OutputScalar[name] = *dest
	}

	for _, td := range tableDests {
		scanned, err := scanRowsToStructs[T](td.rows)
		if err != nil {
			stmt.Close()
			return nil, fmt.Errorf("hdbhelper: scan typed table output %s: %w", td.name, err)
		}
		result.ResultSets = append(result.ResultSets, scanned)
	}

	stmt.Close()
	return result, nil
}

type tableDest struct {
	name string
	rows *sql.Rows
}

func (p *Procedure) buildCallArgs(inputParams []any) (string, []any, map[string]*any, []tableDest, error) {
	placeholders := make([]string, len(p.params))
	for i := range placeholders {
		placeholders[i] = "?"
	}
	callSQL := fmt.Sprintf(`CALL %s."%s"(%s)`, p.schema, p.name, strings.Join(placeholders, ","))

	var namedArgs []any
	scalarDests := make(map[string]*any)
	var tableDests []tableDest
	inputIdx := 0

	for _, param := range p.params {
		switch param.ParameterType {
		case "IN":
			if inputIdx >= len(inputParams) {
				namedArgs = append(namedArgs, sql.Named(param.Name, nil))
			} else {
				namedArgs = append(namedArgs, sql.Named(param.Name, inputParams[inputIdx]))
				inputIdx++
			}

		case "OUT":
			if param.TableTypeName != "" {
				var rows sql.Rows
				namedArgs = append(namedArgs, sql.Named(param.Name, sql.Out{Dest: &rows}))
				tableDests = append(tableDests, tableDest{name: param.Name, rows: &rows})
			} else {
				var dest any
				namedArgs = append(namedArgs, sql.Named(param.Name, sql.Out{Dest: &dest}))
				scalarDests[param.Name] = &dest
			}

		case "INOUT":
			if inputIdx >= len(inputParams) {
				var dest any
				namedArgs = append(namedArgs, sql.Named(param.Name, sql.Out{Dest: &dest, In: true}))
				scalarDests[param.Name] = &dest
			} else {
				dest := inputParams[inputIdx]
				inputIdx++
				namedArgs = append(namedArgs, sql.Named(param.Name, sql.Out{Dest: &dest, In: true}))
				scalarDests[param.Name] = &dest
			}
		}
	}

	return callSQL, namedArgs, scalarDests, tableDests, nil
}

func scanRowsToStructs[T any](rows *sql.Rows) ([]T, error) {
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var t T
	rt := reflect.TypeOf(t)
	if rt.Kind() == reflect.Ptr {
		rt = rt.Elem()
	}

	colToField := make(map[string]int, len(cols))
	for i := 0; i < rt.NumField(); i++ {
		f := rt.Field(i)
		tag := f.Tag.Get("db")
		if tag == "" || tag == "-" {
			tag = f.Name
		}
		colToField[strings.ToUpper(tag)] = i
	}

	var results []T
	for rows.Next() {
		values := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}

		item := reflect.New(rt).Elem()
		for i, col := range cols {
			if fi, ok := colToField[strings.ToUpper(col)]; ok {
				field := item.Field(fi)
				if field.CanSet() && values[i] != nil {
					val := reflect.ValueOf(values[i])
					if val.Type().AssignableTo(field.Type()) {
						field.Set(val)
					} else if val.Type().ConvertibleTo(field.Type()) {
						field.Set(val.Convert(field.Type()))
					}
				}
			}
		}
		results = append(results, item.Interface().(T))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}
