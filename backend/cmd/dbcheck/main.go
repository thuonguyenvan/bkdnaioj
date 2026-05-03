package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL not set")
		os.Exit(1)
	}

	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Host: %s:%d  DB: %s  User: %s\n", cfg.Host, cfg.Port, cfg.Database, cfg.User)

	addrs, err := net.LookupHost(cfg.Host)
	if err != nil {
		fmt.Fprintf(os.Stderr, "DNS fail: %v\n", err)
	} else {
		for _, a := range addrs {
			fmt.Printf("  -> %s\n", a)
		}
	}

	// For Supabase pooler (transaction mode), disable prepared statements
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	var dbName, curUser, ver string
	_ = conn.QueryRow(ctx, `SELECT current_database()`).Scan(&dbName)
	_ = conn.QueryRow(ctx, `SELECT current_user`).Scan(&curUser)
	_ = conn.QueryRow(ctx, `SELECT version()`).Scan(&ver)
	fmt.Printf("\nDB=%s User=%s\nPG=%s\n", dbName, curUser, ver)

	var tcount int
	_ = conn.QueryRow(ctx, `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`).Scan(&tcount)
	fmt.Printf("\nPublic tables: %d\n", tcount)

	rows, _ := conn.Query(ctx, `SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname, tablename`)
	defer rows.Close()
	for rows.Next() {
		var s, t string
		_ = rows.Scan(&s, &t)
		fmt.Printf("  %s.%s\n", s, t)
	}

	// ENUMs
	rows2, _ := conn.Query(ctx, `SELECT n.nspname, t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typtype='e' ORDER BY n.nspname, t.typname`)
	defer rows2.Close()
	fmt.Println("\nENUMs:")
	for rows2.Next() {
		var ns, e string
		_ = rows2.Scan(&ns, &e)
		fmt.Printf("  %s.%s\n", ns, e)
	}

	fmt.Println("\nDONE")
}
