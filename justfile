# Oscilla Animator - Common Tasks
# Run `just` to see available commands

# Default recipe - show help
default:
    @just --list

# Development server
dev:
    pnpm dev

# Development server with host binding (for network access)
dev-host:
    pnpm dev --host 0.0.0.0

# Production build
build:
    pnpm build

# Preview production build
preview:
    pnpm preview

# Type checking
typecheck:
    pnpm typecheck

# Run all tests
test:
    pnpm test

# Run tests in watch mode
test-watch:
    pnpm test --watch

# Run tests with UI
test-ui:
    pnpm test:ui

# Run a specific test file
test-file file:
    pnpm test {{file}}

# Lint
lint:
    pnpm lint

# Lint with auto-fix
lint-fix:
    pnpm lint --fix

# Full check (typecheck + lint + test)
check:
    pnpm typecheck && pnpm lint && pnpm test run

# Clean build artifacts
clean:
    rm -rf dist node_modules/.vite

# Clean and reinstall dependencies
clean-install:
    rm -rf node_modules pnpm-lock.yaml
    pnpm install

# Show project stats
stats:
    @echo "TypeScript files:"
    @find src -name "*.ts" -o -name "*.tsx" | wc -l
    @echo "Lines of code:"
    @find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | tail -1
    @echo "Test files:"
    @find src -name "*.test.ts" -o -name "*.test.tsx" | wc -l

# Open in browser (macOS)
open:
    open http://localhost:5173

# Build and analyze bundle size
analyze:
    pnpm build --mode production
    @echo "\nBundle sizes:"
    @ls -lh dist/assets/*.js dist/assets/*.css 2>/dev/null || true
