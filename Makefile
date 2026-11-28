# SPDX-License-Identifier: MIT
# Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
# Makefile for mytasker. Run "make" or "make help" to list the targets.
# The targets wrap the npm scripts. A comment after "##" is the help text.

SHELL := /bin/bash
.DEFAULT_GOAL := help

TEST_DIR ?= $(HOME)/mytasker-test
CHROMIUM ?= /usr/bin/chromium
export CHROMIUM
SBOM_FORMAT ?= cyclonedx
# The oplog-core repository, relative to this folder. package.json and the CI use ../oplog-core.
# Use another folder (for example a git worktree of oplog-core) for local work only, and run
# "make oplog-core-link" with the same value (scripts/oplog-core-ref.mjs).
OPLOG_CORE_DIR ?= ../oplog-core
ifeq ($(strip $(OPLOG_CORE_DIR)),)
OPLOG_CORE_DIR := ../oplog-core
endif
export OPLOG_CORE_DIR

.PHONY: help install typecheck test simulate build e2e perf check release sbom \
        oplog-core-ref oplog-core-check oplog-core-link check-sbom test-folder demo outdated audit clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make <target> [VAR=value]\n\nTargets:\n"} \
		/^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-17s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\nVariables:\n  TEST_DIR=%s\n  CHROMIUM=%s\n  SBOM_FORMAT=%s\n  OPLOG_CORE_DIR=%s\n" "$(TEST_DIR)" "$(CHROMIUM)" "$(SBOM_FORMAT)" "$(OPLOG_CORE_DIR)"

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

check: oplog-core-check typecheck test build check-sbom ## Run the checks before each commit (add "make e2e" for UI changes)

# npm sbom accepts only the folder of package.json (../oplog-core). If node_modules/oplog-core
# links to a different folder (OPLOG_CORE_DIR), "make check" skips the SBOM checks with a
# warning. The CI always runs them.
check-sbom:
	node scripts/sbom.mjs $(SBOM_FORMAT) --skip-other-oplog-core

release: ## Build release/app/ (index.html, LICENSE, THIRD-PARTY-NOTICES.md, VERSION, SHA256SUMS), release/mytasker-<version>.zip and release/sbom/
	npm run release

sbom: ## Write the SBOMs to release/sbom/ (runtime + build, SBOM_FORMAT=cyclonedx|spdx) and check them
	node scripts/sbom.mjs $(SBOM_FORMAT)

oplog-core-ref: ## Pin the HEAD of OPLOG_CORE_DIR in .oplog-core-ref (the commit that the CI uses)
	node scripts/oplog-core-ref.mjs update

oplog-core-check: ## Check that OPLOG_CORE_DIR is clean, at the commit of .oplog-core-ref and linked in node_modules
	node scripts/oplog-core-ref.mjs check

oplog-core-link: ## Link node_modules/oplog-core to OPLOG_CORE_DIR (again after npm ci)
	node scripts/oplog-core-ref.mjs link

test-folder: release ## Make a local test "shared folder" in TEST_DIR with the current release
	./release/create-folders.sh "$(TEST_DIR)"
	cp release/app/* "$(TEST_DIR)/app/"
	@echo "Open file://$(TEST_DIR)/app/index.html and select the folder $(TEST_DIR)."

demo: build ## Build and print the URL of the demo mode (synthetic data)
	@echo "Open file://$(CURDIR)/dist/index.html?demo"

outdated: ## List npm dependencies with newer versions
	-npm outdated

audit: ## Check npm dependencies for known vulnerabilities (all: moderate; the CI checks runtime: low)
	npm audit --audit-level=moderate
	npm audit --omit=dev --audit-level=low

clean: ## Remove build output (dist/, release/app/, release/*.zip, release/sbom/)
	rm -rf dist release/app release/*.zip release/sbom
