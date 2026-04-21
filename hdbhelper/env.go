package hdbhelper

import (
	"context"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/SAP/go-hdb/driver"
)

// ConnectionConfig holds explicit HANA connection parameters.
type ConnectionConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	Schema   string
	Encrypt  bool
}

// Option configures connection behavior.
type Option func(*envConfig)

type envConfig struct {
	targetContainer string
	schema          string
}

// WithTargetContainer selects a specific service binding by instance name
// instead of searching by tag.
func WithTargetContainer(name string) Option {
	return func(c *envConfig) { c.targetContainer = name }
}

// WithSchema overrides the default schema from connection credentials.
func WithSchema(s string) Option {
	return func(c *envConfig) { c.schema = s }
}

// DB wraps a *sql.DB with HANA-specific convenience methods.
type DB struct {
	*sql.DB
	schema string
}

// Open creates a HANA connection from explicit configuration.
func Open(cfg ConnectionConfig) (*DB, error) {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	connector := driver.NewBasicAuthConnector(addr, cfg.User, cfg.Password)

	if cfg.Encrypt {
		connector.SetTLSConfig(&tls.Config{ServerName: cfg.Host})
	}
	if cfg.Schema != "" {
		connector.SetDefaultSchema(cfg.Schema)
	}

	sqlDB := sql.OpenDB(connector)
	if err := sqlDB.Ping(); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("hdbhelper: ping failed: %w", err)
	}

	return &DB{DB: sqlDB, schema: cfg.Schema}, nil
}

// OpenFromEnv loads HANA credentials from the VCAP_SERVICES environment
// variable or from a default-env.json file in the current working directory.
func OpenFromEnv(opts ...Option) (*DB, error) {
	cfg := &envConfig{}
	for _, o := range opts {
		o(cfg)
	}

	if v := os.Getenv("TARGET_CONTAINER"); v != "" && cfg.targetContainer == "" {
		cfg.targetContainer = v
	}

	vcap := os.Getenv("VCAP_SERVICES")
	if vcap != "" {
		return openFromVCAP([]byte(vcap), cfg)
	}

	envPath := ResolveEnvPath(false)
	return OpenFromEnvFile(envPath, opts...)
}

// OpenFromEnvFile loads HANA credentials from a specific JSON file.
func OpenFromEnvFile(path string, opts ...Option) (*DB, error) {
	cfg := &envConfig{}
	for _, o := range opts {
		o(cfg)
	}

	if v := os.Getenv("TARGET_CONTAINER"); v != "" && cfg.targetContainer == "" {
		cfg.targetContainer = v
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("hdbhelper: cannot read env file %s: %w", path, err)
	}

	var envelope struct {
		VCAP json.RawMessage `json:"VCAP_SERVICES"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, fmt.Errorf("hdbhelper: cannot parse env file %s: %w", path, err)
	}
	if envelope.VCAP == nil {
		return nil, fmt.Errorf("hdbhelper: no VCAP_SERVICES key in %s", path)
	}

	return openFromVCAP(envelope.VCAP, cfg)
}

// ResolveEnvPath returns the path to default-env.json (or default-env-admin.json
// if admin is true) relative to the current working directory.
func ResolveEnvPath(admin bool) string {
	name := "default-env.json"
	if admin {
		name = "default-env-admin.json"
	}
	cwd, err := os.Getwd()
	if err != nil {
		return name
	}
	return filepath.Join(cwd, name)
}

type vcapService struct {
	Name        string          `json:"name"`
	Tags        []string        `json:"tags"`
	Plan        string          `json:"plan"`
	Credentials json.RawMessage `json:"credentials"`
}

type hanaCredentials struct {
	Host     string      `json:"host"`
	Port     interface{} `json:"port"`
	User     string      `json:"user"`
	Password string      `json:"password"`
	Schema   string      `json:"schema"`
	Encrypt  interface{} `json:"encrypt"`
}

func openFromVCAP(vcapJSON []byte, cfg *envConfig) (*DB, error) {
	var services map[string][]vcapService
	if err := json.Unmarshal(vcapJSON, &services); err != nil {
		return nil, fmt.Errorf("hdbhelper: cannot parse VCAP_SERVICES: %w", err)
	}

	svc, err := resolveService(services, cfg.targetContainer)
	if err != nil {
		return nil, err
	}

	var creds hanaCredentials
	if err := json.Unmarshal(svc.Credentials, &creds); err != nil {
		return nil, fmt.Errorf("hdbhelper: cannot parse credentials: %w", err)
	}

	connCfg := ConnectionConfig{
		Host:     creds.Host,
		Port:     parsePort(creds.Port),
		User:     creds.User,
		Password: creds.Password,
		Schema:   creds.Schema,
		Encrypt:  parseBool(creds.Encrypt),
	}

	if cfg.schema != "" {
		connCfg.Schema = cfg.schema
	}

	return Open(connCfg)
}

func resolveService(services map[string][]vcapService, targetContainer string) (*vcapService, error) {
	if targetContainer != "" {
		for _, svcs := range services {
			for i := range svcs {
				if svcs[i].Name == targetContainer {
					return &svcs[i], nil
				}
			}
		}
		return nil, fmt.Errorf("hdbhelper: no service with name %q found in VCAP_SERVICES", targetContainer)
	}

	if svc := findByTag(services, "hana", ""); svc != nil {
		return svc, nil
	}
	if svc := findByTag(services, "hana", "hdi-shared"); svc != nil {
		return svc, nil
	}

	return nil, fmt.Errorf("hdbhelper: no HANA service found in VCAP_SERVICES (searched by tag 'hana')")
}

func findByTag(services map[string][]vcapService, tag, plan string) *vcapService {
	for _, svcs := range services {
		for i := range svcs {
			for _, t := range svcs[i].Tags {
				if t == tag {
					if plan == "" || svcs[i].Plan == plan {
						return &svcs[i]
					}
				}
			}
		}
	}
	return nil
}

func parsePort(v interface{}) int {
	switch p := v.(type) {
	case float64:
		return int(p)
	case string:
		n, _ := strconv.Atoi(p)
		return n
	default:
		return 443
	}
}

func parseBool(v interface{}) bool {
	switch b := v.(type) {
	case bool:
		return b
	case string:
		return b == "true"
	default:
		return false
	}
}

// SetSchema executes SET SCHEMA on the connection.
func (db *DB) SetSchema(ctx context.Context, schema string) error {
	quoted := `"` + strings.ReplaceAll(schema, `"`, `""`) + `"`
	_, err := db.ExecContext(ctx, "SET SCHEMA "+quoted)
	if err == nil {
		db.schema = schema
	}
	return err
}

// CurrentSchema returns the active schema for this connection.
func (db *DB) CurrentSchema(ctx context.Context) (string, error) {
	var schema string
	err := db.QueryRowContext(ctx, "SELECT CURRENT_SCHEMA FROM DUMMY").Scan(&schema)
	return schema, err
}
