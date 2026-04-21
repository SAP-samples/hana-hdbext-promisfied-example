package hdbhelper

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// --- Unit tests (always run, no HANA required) ---

func TestObjectName(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"", "%"},
		{"*", "%"},
		{"MY_TABLE", "MY_TABLE%"},
		{"SYS", "SYS%"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := ObjectName(tt.input)
			if got != tt.want {
				t.Errorf("ObjectName(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestResolveEnvPath(t *testing.T) {
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}

	got := ResolveEnvPath(false)
	want := filepath.Join(cwd, "default-env.json")
	if got != want {
		t.Errorf("ResolveEnvPath(false) = %q, want %q", got, want)
	}

	got = ResolveEnvPath(true)
	want = filepath.Join(cwd, "default-env-admin.json")
	if got != want {
		t.Errorf("ResolveEnvPath(true) = %q, want %q", got, want)
	}
}

func TestResolveService(t *testing.T) {
	vcapJSON := `{
		"hana": [{
			"name": "my-hana",
			"tags": ["hana"],
			"plan": "hdi-shared",
			"credentials": {"host": "h1", "port": 443}
		}],
		"xsuaa": [{
			"name": "my-xsuaa",
			"tags": ["xsuaa"],
			"credentials": {"url": "https://auth"}
		}]
	}`

	var services map[string][]vcapService
	if err := json.Unmarshal([]byte(vcapJSON), &services); err != nil {
		t.Fatal(err)
	}

	t.Run("by tag", func(t *testing.T) {
		svc, err := resolveService(services, "")
		if err != nil {
			t.Fatal(err)
		}
		if svc.Name != "my-hana" {
			t.Errorf("got name %q, want %q", svc.Name, "my-hana")
		}
	})

	t.Run("by name", func(t *testing.T) {
		svc, err := resolveService(services, "my-hana")
		if err != nil {
			t.Fatal(err)
		}
		if svc.Name != "my-hana" {
			t.Errorf("got name %q, want %q", svc.Name, "my-hana")
		}
	})

	t.Run("by name not found", func(t *testing.T) {
		_, err := resolveService(services, "nonexistent")
		if err == nil {
			t.Error("expected error for nonexistent service")
		}
	})
}

func TestParsePort(t *testing.T) {
	if got := parsePort(float64(443)); got != 443 {
		t.Errorf("parsePort(443.0) = %d, want 443", got)
	}
	if got := parsePort("30015"); got != 30015 {
		t.Errorf("parsePort(\"30015\") = %d, want 30015", got)
	}
	if got := parsePort(nil); got != 443 {
		t.Errorf("parsePort(nil) = %d, want 443", got)
	}
}

func TestParseBool(t *testing.T) {
	if got := parseBool(true); !got {
		t.Error("parseBool(true) = false")
	}
	if got := parseBool("true"); !got {
		t.Error(`parseBool("true") = false`)
	}
	if got := parseBool(false); got {
		t.Error("parseBool(false) = true")
	}
	if got := parseBool(nil); got {
		t.Error("parseBool(nil) = true")
	}
}

func TestOpenFromEnvFile(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, "default-env.json")

	content := `{
		"VCAP_SERVICES": {
			"hana": [{
				"name": "test-hana",
				"tags": ["hana"],
				"credentials": {
					"host": "localhost",
					"port": 30015,
					"user": "SYSTEM",
					"password": "secret",
					"schema": "TEST_SCHEMA",
					"encrypt": false
				}
			}]
		}
	}`
	if err := os.WriteFile(envFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := OpenFromEnvFile(envFile)
	if err == nil {
		t.Skip("unexpectedly connected to HANA — skipping connection-failure assertion")
	}
	if !strings.Contains(err.Error(), "ping failed") {
		t.Errorf("expected ping failure, got: %v", err)
	}
}

func TestOpenFromEnvFileMissing(t *testing.T) {
	_, err := OpenFromEnvFile("/nonexistent/default-env.json")
	if err == nil {
		t.Error("expected error for missing file")
	}
}

func TestOpenFromEnvFileNoVCAP(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, "default-env.json")
	if err := os.WriteFile(envFile, []byte(`{"other": "data"}`), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := OpenFromEnvFile(envFile)
	if err == nil {
		t.Error("expected error for missing VCAP_SERVICES")
	}
}

// --- Integration tests (auto-skip when HANA is unreachable) ---

func mustConnect(t *testing.T) *DB {
	t.Helper()
	db, err := OpenFromEnv()
	if err != nil {
		t.Skipf("HANA not reachable, skipping integration tests: %v", err)
	}
	return db
}

func TestIntegration(t *testing.T) {
	db := mustConnect(t)
	defer db.Close()

	t.Run("ExecSQL", func(t *testing.T) {
		rows, err := db.ExecSQL(t.Context(), `SELECT 1 AS "VAL" FROM DUMMY`)
		if err != nil {
			t.Fatal(err)
		}
		if len(rows) != 1 {
			t.Fatalf("expected 1 row, got %d", len(rows))
		}
		if rows[0]["VAL"] == nil {
			t.Error("expected VAL column in result")
		}
	})

	t.Run("CurrentSchema", func(t *testing.T) {
		schema, err := db.CurrentSchema(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		if schema == "" {
			t.Error("expected non-empty schema")
		}
	})

	t.Run("SchemaCalc", func(t *testing.T) {
		schema, err := SchemaCalc(t.Context(), db, "**CURRENT_SCHEMA**")
		if err != nil {
			t.Fatal(err)
		}
		if schema == "" {
			t.Error("expected non-empty schema from **CURRENT_SCHEMA**")
		}

		schema, err = SchemaCalc(t.Context(), db, "*")
		if err != nil {
			t.Fatal(err)
		}
		if schema != "%" {
			t.Errorf("SchemaCalc(*, db) = %q, want %%", schema)
		}

		schema, err = SchemaCalc(t.Context(), db, "MY_SCHEMA")
		if err != nil {
			t.Fatal(err)
		}
		if schema != "MY_SCHEMA" {
			t.Errorf("SchemaCalc(MY_SCHEMA, db) = %q, want MY_SCHEMA", schema)
		}
	})

	t.Run("Ping", func(t *testing.T) {
		if err := db.Ping(); err != nil {
			t.Errorf("Ping failed: %v", err)
		}
	})
}
