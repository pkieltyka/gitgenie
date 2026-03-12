.PHONY: init build run install uninstall typecheck clean help

# Default target
help:
	@echo "git-genie development commands:"
	@echo ""
	@echo "  make init        Install dependencies (bun install)"
	@echo "  make build       Compile to single executable in dist/"
	@echo "  make run         Run the CLI (pass args with ARGS=, e.g. make run ARGS='--help')"
	@echo "  make install     Symlink gitgenie to ~/.local/bin"
	@echo "  make uninstall   Remove gitgenie symlink"
	@echo "  make typecheck   Run TypeScript type checking"
	@echo "  make clean       Remove dist/ and build artifacts"
	@echo ""
	@echo "Examples:"
	@echo "  make run ARGS='login anthropic'"
	@echo "  make run ARGS='release-notes v1.0 v1.1 --deep'"
	@echo "  make run ARGS='review abc123'"

ARGS ?=

init:
	bun install

build:
	bun build src/index.ts --compile --outfile dist/gitgenie
	@echo ""
	@echo "Built: dist/gitgenie"
	@echo "You can copy dist/gitgenie to somewhere in your PATH"

run:
	@bun run src/index.ts $(ARGS)

# Symlinks bin/gitgenie into ~/.local/bin so it's on PATH.
# Works on any system where ~/.local/bin is in PATH (standard on Linux/macOS).
install:
	@mkdir -p ~/.local/bin
	@ln -sf $(CURDIR)/bin/gitgenie ~/.local/bin/gitgenie
	@echo "Installed: ~/.local/bin/gitgenie -> $(CURDIR)/bin/gitgenie"
	@echo ""
	@echo "Make sure ~/.local/bin is in your PATH. Try: gitgenie --help"

uninstall:
	@rm -f ~/.local/bin/gitgenie
	@echo "Removed ~/.local/bin/gitgenie"

typecheck:
	bunx tsc --noEmit

clean:
	rm -rf dist/
