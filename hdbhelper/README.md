# SAP HANA Helper for Go (hdbhelper)

[![REUSE status](https://api.reuse.software/badge/github.com/SAP-samples/hana-hdbext-promisfied-example)](https://api.reuse.software/info/github.com/SAP-samples/hana-hdbext-promisfied-example)

## Description

With the standard [go-hdb](https://github.com/SAP/go-hdb) driver, connecting to SAP HANA from environment credentials and calling stored procedures requires substantial boilerplate:

```go
// Parse VCAP_SERVICES or default-env.json manually...
data, _ := os.ReadFile("default-env.json")
var env map[string]any
json.Unmarshal(data, &env)
// ...extract host, port, user, password, TLS config...
connector := driver.NewBasicAuthConnector(addr, user, password)
connector.SetTLSConfig(&tls.Config{ServerName: host})
db := sql.OpenDB(connector)

// Call a stored procedure with table output
stmt, _ := db.Prepare("CALL MY_SCHEMA.\"MY_PROC\"(?)")
var tableRows sql.Rows
stmt.Exec(sql.Named("T", sql.Out{Dest: &tableRows}))
for tableRows.Next() {
    var col1 string
    tableRows.Scan(&col1)
    // ...
}
```

With `hdbhelper`, the same code becomes:

```go
import "github.com/SAP-samples/hana-hdbext-promisfied-example/hdbhelper"

db, _ := hdbhelper.OpenFromEnv()
defer db.Close()

// Simple query
rows, _ := db.ExecSQL(ctx, `SELECT SESSION_USER, CURRENT_SCHEMA FROM DUMMY`)
fmt.Println(rows)

// Stored procedure — automatic parameter binding and result mapping
proc, _ := db.LoadProcedure(ctx, "MY_SCHEMA", "MY_PROC")
result, _ := proc.Call(ctx)
fmt.Println(result.OutputScalar)
fmt.Println(result.ResultSets)
```

## Installation

```shell
go get github.com/SAP-samples/hana-hdbext-promisfied-example/hdbhelper
```

## Usage

### Creating a connection

Load credentials from `VCAP_SERVICES` environment variable or `default-env.json`:

```go
db, err := hdbhelper.OpenFromEnv()
if err != nil {
    log.Fatal(err)
}
defer db.Close()
```

From a specific env file:

```go
db, err := hdbhelper.OpenFromEnvFile("/path/to/default-env.json")
```

With explicit configuration:

```go
db, err := hdbhelper.Open(hdbhelper.ConnectionConfig{
    Host:     "my-hana.hanacloud.ondemand.com",
    Port:     443,
    User:     "DBADMIN",
    Password: "secret",
    Schema:   "MY_SCHEMA",
    Encrypt:  true,
})
```

Override the target container or schema via options:

```go
db, err := hdbhelper.OpenFromEnv(
    hdbhelper.WithTargetContainer("my-hdi-container"),
    hdbhelper.WithSchema("CUSTOM_SCHEMA"),
)
```

### Querying

```go
ctx := context.Background()

// Execute SQL and get results as []map[string]any
rows, err := db.ExecSQL(ctx, `SELECT SESSION_USER, CURRENT_SCHEMA FROM DUMMY`)

// Schema helpers
schema, err := db.CurrentSchema(ctx)
err = db.SetSchema(ctx, "NEW_SCHEMA")
```

### Stored procedures

```go
// Load procedure metadata
proc, err := db.LoadProcedure(ctx, "MY_SCHEMA", "MY_PROC")

// Call with input parameters — results as maps
result, err := proc.Call(ctx, "input_value_1", 42)
fmt.Println(result.OutputScalar)  // map[string]any
fmt.Println(result.ResultSets)    // [][]map[string]any
```

For typed results using struct scanning:

```go
type Employee struct {
    ID   int    `db:"ID"`
    Name string `db:"NAME"`
}

result, err := hdbhelper.CallTyped[Employee](proc, ctx, "input_value")
for _, emp := range result.ResultSets[0] {
    fmt.Printf("%d: %s\n", emp.ID, emp.Name)
}
```

### Helper functions

```go
// Resolve schema wildcards
schema, _ := hdbhelper.SchemaCalc(ctx, db, "**CURRENT_SCHEMA**")  // → actual schema
schema, _ = hdbhelper.SchemaCalc(ctx, db, "*")                     // → "%"

// Expand object name for LIKE patterns
name := hdbhelper.ObjectName("MY_TABLE")  // → "MY_TABLE%"
name = hdbhelper.ObjectName("*")           // → "%"
```

## API Reference

### Connection

| Function | Description |
| --- | --- |
| `Open(cfg)` | Open connection with explicit config |
| `OpenFromEnv(opts...)` | Open from `VCAP_SERVICES` env var or `default-env.json` |
| `OpenFromEnvFile(path, opts...)` | Open from a specific env file |
| `ResolveEnvPath(admin)` | Path to `default-env.json` or `default-env-admin.json` |

### DB methods

| Method | Description |
| --- | --- |
| `ExecSQL(ctx, sql)` | Execute SQL, return `[]map[string]any` |
| `CurrentSchema(ctx)` | Get the current connection schema |
| `SetSchema(ctx, schema)` | Set the active schema |
| `LoadProcedure(ctx, schema, name)` | Load stored procedure metadata |
| `Close()` | Close the database connection |
| `Ping()` | Verify the connection is alive |

### Stored procedures

| Function / Method | Description |
| --- | --- |
| `(*Procedure).Call(ctx, params...)` | Call procedure, return `*ProcedureResult` with maps |
| `CallTyped[T](proc, ctx, params...)` | Call procedure, scan results into structs of type `T` |

### Helpers

| Function | Description |
| --- | --- |
| `SchemaCalc(ctx, db, schema)` | Resolve `**CURRENT_SCHEMA**` / `*` wildcards |
| `ObjectName(name)` | Expand `*` / `""` → `%`; otherwise append `%` |
| `WithTargetContainer(name)` | Option: select service binding by name |
| `WithSchema(s)` | Option: override default schema |

## Environment Configuration

Connection credentials are loaded from `default-env.json` (same format as the Node.js packages):

```json
{
  "VCAP_SERVICES": {
    "hana": [{
      "name": "my-hana-service",
      "tags": ["hana"],
      "credentials": {
        "host": "...",
        "port": 443,
        "user": "...",
        "password": "...",
        "encrypt": true
      }
    }]
  }
}
```

- Use `default-env-admin.json` for admin connections (`ResolveEnvPath(true)`).
- Set `TARGET_CONTAINER` env var to select a specific service binding by name.
- TLS is enabled automatically when `encrypt: true` is present.

## Requirements

- Go 1.22 or higher
- [SAP/go-hdb](https://github.com/SAP/go-hdb) driver (pulled automatically by `go get`)
- SAP HANA Cloud or on-premise HANA instance

## Known Issues

None

## How to obtain support

This project is provided "as-is": there is no guarantee that raised issues will be answered or addressed in future releases.

## License

Copyright (c) 2026 SAP SE or an SAP affiliate company. All rights reserved. This project is licensed under the Apache Software License, version 2.0 except as noted otherwise in the [LICENSE](../LICENSES/Apache-2.0.txt) file.
