# Changelog

## 0.0.3

### Features

- **Full image URLs**: Product images and restaurant logos now display complete `https://images.rappi.com/...` URLs instead of bare filenames. Applied across CLI commands and MCP server output.
- **New UI layer** (`src/ui/`): Added `chalk`, `cli-table3`, and `ora` for clean terminal formatting with Rappi's brand orange (`#FF441F`).
- **Update notifier**: CLI checks npm for newer versions on every command run and shows an upgrade prompt when available.

### Improvements

- **Borderless tables** for search results, restaurants, store menus, cart, orders, and addresses.
- **Spinners** on all async operations (search, loading cart, checkout, etc.).
- **Consistent status indicators**: green `✓` for success, red `error` for failures, yellow warnings.
- **Aligned key-value detail views** for whoami, store detail, address set, and login/setup.
- **Styled help banner** with chalk colors: cyan commands, dim arguments, bold section headers.
- **"What's next?" hints** after login and setup with suggested commands.

## 0.0.2

### Features

- **Remove from cart**: Added `rappi remove-from-cart` command.
- **Graceful Playwright error**: Shows manual token setup instructions when Playwright is not installed.

## 0.0.1

- Initial release.
