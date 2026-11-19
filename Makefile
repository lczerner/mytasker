# SPDX-License-Identifier: MIT
# Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
# Makefile for mytasker. Run "make" or "make help" to list the targets.
# The targets wrap the npm scripts. A comment after "##" is the help text.

SHELL := /bin/bash
.DEFAULT_GOAL := help

TEST_DIR ?= $(HOME)/mytasker-test
CHROMIUM ?= /usr/bin/chromium
export CHROMIUM

.PHONY: help install typecheck test simulate build e2e perf check release \
        test-folder demo outdated audit clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make <target> [VAR=value]\n\nTargets:\n"} \
		/^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\nVariables:\n  TEST_DIR=%s\n  CHROMIUM=%s\n" "$(TEST_DIR)" "$(CHROMIUM)"

install: ## Install the npm dependencies (npm ci)
	npm ci

typecheck: ## Run the TypeScript type check
	npm run typecheck

test: ## Run unit, property and simulation tests
	npm test

simulate: ## Run only the multi-user simulation
	npm run simulate

build: ## Build dist/index.html and run the build check (SKIP_BROWSER=1 skips Chromium)
	npm run build

e2e: ## Build and run the browser tests (Chromium, see CHROMIUM)
	npm run test:e2e

perf: ## Measure cold start and refresh time
	npm run perf

check: typecheck test build ## Run the checks before each commit (add "make e2e" for UI changes)

release: ## Build release/app/ (index.html, LICENSE, VERSION, SHA256SUMS)
	npm run release

test-folder: release ## Make a local test "shared folder" in TEST_DIR with the current release
	./release/create-folders.sh "$(TEST_DIR)"
	cp release/app/* "$(TEST_DIR)/app/"
	@echo "Open file://$(TEST_DIR)/app/index.html and select the folder $(TEST_DIR)."

demo: build ## Build and print the URL of the demo mode (synthetic data)
	@echo "Open file://$(CURDIR)/dist/index.html?demo"

outdated: ## List npm dependencies with newer versions
	-npm outdated

audit: ## Check npm dependencies for known vulnerabilities
	npm audit

clean: ## Remove build output (dist/, release/app/)
	rm -rf dist release/app
