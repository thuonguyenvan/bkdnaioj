SHELL := /bin/bash
DB_URL ?= postgres://olpai:olpai@localhost:5432/olpai?sslmode=disable

.PHONY: deps sqlc migrate-up migrate-down migrate-status migrate-reset run dev test fmt lint build docker-up docker-down docker-logs seed tools

deps:
	go mod download

tools:
	go install github.com/pressly/goose/v3/cmd/goose@latest
	go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
	go install github.com/air-verse/air@latest
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

sqlc:
	sqlc generate

migrate-up:
	goose -dir migrations postgres "$(DB_URL)" up

migrate-down:
	goose -dir migrations postgres "$(DB_URL)" down

migrate-status:
	goose -dir migrations postgres "$(DB_URL)" status

migrate-reset:
	goose -dir migrations postgres "$(DB_URL)" reset

run:
	go run ./cmd/api

dev:
	air

test:
	go test ./... -race -cover

fmt:
	gofmt -w .
	go mod tidy

lint:
	golangci-lint run

build:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/api ./cmd/api

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f api

seed:
	go run ./cmd/seed
