# Publishing Guide

## Steps to Publish Your ADK Node.js Module

### 1. Update Repository URLs

Before publishing, update the repository URLs in `package.json`:

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/adk-nodejs.git"
  },
  "homepage": "https://github.com/YOUR_USERNAME/adk-nodejs#readme",
  "bugs": {
    "url": "https://github.com/YOUR_USERNAME/adk-nodejs/issues"
  }
}
```

### 2. Choose a Unique Package Name

The current name `adk-nodejs` might be taken. Consider:
- `@your-username/adk-nodejs`
- `adk-nodejs-framework`
- `ai-agent-development-kit`

Update the `name` field in `package.json`:

```json
{
  "name": "@your-username/adk-nodejs",
  "version": "1.0.0"
}
```

### 3. Build the Project

```bash
bun run build
```

### 4. Test the Build

```bash
# Test that imports work
node -e "const { LlmAgent, Runner } = await import('./dist/index.js'); console.log('✅ Module works!');"
```

### 5. Publish to npm

#### Option A: Using npm

```bash
# Login to npm (if not already logged in)
npm login

# Publish the package
npm publish
```

#### Option B: Using Bun

```bash
# Bun can also publish to npm
bun publish
```

### 6. Verify Installation

After publishing, test installation:

```bash
# In a new directory
mkdir test-install && cd test-install
bun init -y
bun add your-package-name

# Test import
echo 'import { LlmAgent } from "your-package-name"; console.log("✅ Installed successfully!");' > test.js
node test.js
```

## Publishing Checklist

- [ ] Updated repository URLs in package.json
- [ ] Chosen a unique package name
- [ ] Updated version number if needed
- [ ] Built the project (`bun run build`)
- [ ] Tested the built module works
- [ ] Logged into npm registry
- [ ] Published the package
- [ ] Verified installation works

## Scoped Packages (Recommended)

For better namespace management, consider publishing as a scoped package:

```json
{
  "name": "@your-username/adk-nodejs"
}
```

Then users install with:
```bash
bun add @your-username/adk-nodejs
```

And import with:
```typescript
import { LlmAgent, Runner } from '@your-username/adk-nodejs';
```

## Version Management

Follow semantic versioning:
- `1.0.0` - Major release
- `1.1.0` - Minor release (new features)
- `1.0.1` - Patch release (bug fixes)

Update version before each publish:
```bash
npm version patch  # or minor, major
```
