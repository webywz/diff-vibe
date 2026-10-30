# Suite Mode Examples

This directory contains example `.diff` files for testing `diff-vibe --suite` batch mode.

## Files

- `feat-auth.diff` - Add authentication functions (login, logout)
- `fix-typos.diff` - Fix typos in documentation
- `feat-formatters.diff` - Add date and currency formatters
- `test-auth.diff` - Add auth unit tests

## Usage

```bash
# Process all diffs in this directory
diff-vibe --suite examples/suite/

# With custom vibe and locale
diff-vibe --suite examples/suite/ --vibe punchy --locale zh

# With fail gate
diff-vibe --suite examples/suite/ --fail-above 0
```

Each `.diff` file will be processed independently and aggregated into a JSON result with stats.
