# GitHub Actions Setup Guide

Quick guide to set up automated publishing for your ADK Node.js package.

## 📋 Prerequisites

- [x] GitHub repository created
- [x] npm account created
- [ ] npm token generated
- [ ] GitHub secrets configured

## 🚀 Step-by-Step Setup

### 1. Generate npm Token

```bash
# Login to npm
npm login

# Generate an automation token
npm token create --type=automation
```

**Copy the token** - you'll need it in the next step!

### 2. Add npm Token to GitHub Secrets

1. Go to your GitHub repository: `https://github.com/brendanPro/adk-nodejs`
2. Click **Settings** (top menu)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add the token:
   - **Name**: `NPM_TOKEN`
   - **Secret**: Paste your npm token
   - Click **Add secret**

### 3. Enable Workflow Permissions

1. Still in **Settings**, click **Actions** → **General** (left sidebar)
2. Scroll down to **Workflow permissions**
3. Select **"Read and write permissions"**
4. Check **"Allow GitHub Actions to create and approve pull requests"**
5. Click **Save**

### 4. Test the Workflow

#### Option A: Manual Test (Recommended for First Time)

1. Go to **Actions** tab
2. Click **"Build, Version, and Publish"** workflow
3. Click **"Run workflow"** button (right side)
4. Select `patch` for version bump
5. Click **"Run workflow"**
6. Watch the workflow run!

#### Option B: Automatic Test

```bash
# Make a small change
echo "# Test" >> test.txt

# Commit and push
git add test.txt
git commit -m "test: workflow setup"
git push origin main

# The workflow will run automatically!
```

## ✅ Verification

After the workflow completes successfully, verify:

### 1. Check npm
```bash
npm view adk-nodejs
```

You should see your package with the new version!

### 2. Check GitHub Releases
Go to: `https://github.com/brendanPro/adk-nodejs/releases`

You should see a new release created automatically.

### 3. Test Installation
```bash
# In a test directory
mkdir test-install && cd test-install
npm init -y
npm install adk-nodejs
```

## 🔧 Troubleshooting

### "npm ERR! code ENEEDAUTH"
**Problem**: npm token not configured correctly

**Solution**:
1. Re-generate npm token: `npm token create --type=automation`
2. Update GitHub secret with new token

### "fatal: could not read Username"
**Problem**: Workflow doesn't have write permissions

**Solution**:
1. Go to Settings → Actions → General
2. Enable "Read and write permissions"
3. Save and re-run workflow

### "Build failed: dist directory not found"
**Problem**: TypeScript compilation failed

**Solution**:
1. Check the build logs in Actions tab
2. Fix any TypeScript errors locally
3. Test build locally: `bun run build`
4. Push fixes

### "npm ERR! 403 Forbidden"
**Problem**: Package name already taken or token lacks permissions

**Solution**:
1. Check if package name is available: `npm view adk-nodejs`
2. If taken, change package name in `package.json`
3. Ensure npm token has "Automation" or "Publish" permissions

## 📚 Next Steps

1. **Review** `.github/WORKFLOWS.md` for detailed workflow documentation
2. **Customize** version bump rules in `.github/workflows/publish.yml`
3. **Set up** branch protection rules (optional but recommended)
4. **Configure** code coverage and other quality checks

## 🎯 Quick Commands Reference

```bash
# Generate npm token
npm token create --type=automation

# List your npm tokens
npm token list

# Revoke a token
npm token revoke <token-id>

# Check package info
npm view adk-nodejs

# Install specific version
npm install adk-nodejs@1.1.0

# Test local build
bun run build

# Run tests
bun test

# Run linter
bun run lint
```

## 🔐 Security Best Practices

1. **Never commit** npm tokens to your repository
2. **Rotate tokens** periodically for security
3. **Use automation tokens** (not publish tokens) for CI/CD
4. **Enable 2FA** on your npm account
5. **Review** npm access logs regularly

## 🎉 You're All Set!

Your automated CI/CD pipeline is now configured. Every push to `main` will:
- ✅ Build and test your code
- ✅ Automatically bump the version
- ✅ Publish to npm
- ✅ Create a GitHub release

Happy publishing! 🚀
