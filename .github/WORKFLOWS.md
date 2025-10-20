# GitHub Actions Workflows

This repository uses GitHub Actions for automated CI/CD with **Bun** as the build tool.

## 🔄 Workflows Overview

### 1. **CI Workflow** (`ci.yml`)
**Triggers**: 
- Pull requests to `main`
- Pushes to `main` branch

**What it does**:
- ✅ Runs on Node.js 18 and 20 (ensures compatibility)
- ✅ Installs dependencies with **Bun**
- ✅ Runs linter
- ✅ Runs tests
- ✅ Builds the project with **Bun**
- ✅ Verifies the build output
- ✅ Tests that the package can be imported

**Purpose**: Ensures code quality on every commit and PR

---

### 2. **Build and Publish Workflow** (`publish.yml`)
**Trigger**: **Manual only** (workflow_dispatch)

**What it does** (3-stage process):

#### **Stage 1: CI Checks** ✅
- Runs complete CI checks on Node.js 18 and 20
- All checks must pass before proceeding

#### **Stage 2: Manual Approval** 🔒
- **Requires manual approval** in GitHub Actions
- Prevents accidental publishing
- Uses GitHub Environment protection

#### **Stage 3: Publish** 🚀
- Bumps version (patch/minor/major - your choice)
- Updates CHANGELOG.md automatically
- Commits version changes
- Creates Git tag
- Publishes to npm
- Creates GitHub release

**Purpose**: Safe, controlled publishing with human approval

---

## 🚀 How to Publish (Manual Process)

### Step 1: Trigger the Workflow

1. Go to **Actions** tab in GitHub
2. Click **"Build and Publish"** workflow
3. Click **"Run workflow"** (green button on right)
4. Choose version bump type:
   - `patch` - Bug fixes (1.1.0 → 1.1.1)
   - `minor` - New features (1.1.0 → 1.2.0)
   - `major` - Breaking changes (1.1.0 → 2.0.0)
5. Click **"Run workflow"**

### Step 2: Wait for CI Checks

The workflow will run all CI checks first:
- Linting
- Testing
- Building on Node.js 18 and 20
- Import verification

⏱️ **Wait for**: All CI checks to pass (green checkmarks)

### Step 3: Approve Publication 🔒

After CI passes, you'll see a yellow waiting indicator:

1. Click on the workflow run
2. You'll see "Approve Publication" waiting
3. Click **"Review deployments"** button
4. Check the **"production"** checkbox
5. Click **"Approve and deploy"**

### Step 4: Watch it Publish 🎉

After approval, the workflow will:
- ✅ Bump version
- ✅ Update CHANGELOG
- ✅ Commit changes
- ✅ Create Git tag
- ✅ Publish to npm
- ✅ Create GitHub release

---

## 🔐 Required Setup

### 1. Create npm Token

```bash
npm login
npm token create --type=automation
```

### 2. Add Secrets to GitHub

Go to: `Settings → Secrets and variables → Actions`

Add secret:
- **Name**: `NPM_TOKEN`
- **Value**: Your npm token from step 1

### 3. Create Production Environment

Go to: `Settings → Environments`

1. Click **"New environment"**
2. Name: `production`
3. Add **"Required reviewers"**:
   - Add yourself or team members who can approve
4. Click **"Save protection rules"**

### 4. Enable Workflow Permissions

Go to: `Settings → Actions → General`

- Select **"Read and write permissions"**
- Check **"Allow GitHub Actions to create and approve pull requests"**
- Click **"Save"**

---

## 📋 Workflow Architecture

```
┌─────────────────────────────────────────┐
│   Manual Trigger (workflow_dispatch)    │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Stage 1: CI Checks (Node 18 & 20)     │
│  - Install deps (Bun)                   │
│  - Lint, Test, Build                    │
│  - Verify imports                       │
└─────────────────┬───────────────────────┘
                  │ ✅ All checks pass
                  ▼
┌─────────────────────────────────────────┐
│  Stage 2: Manual Approval Required      │
│  🔒 Human reviewer must approve         │
└─────────────────┬───────────────────────┘
                  │ ✅ Approved
                  ▼
┌─────────────────────────────────────────┐
│  Stage 3: Version & Publish             │
│  - Bump version                         │
│  - Update CHANGELOG                     │
│  - Commit & tag                         │
│  - Publish to npm                       │
│  - Create GitHub release                │
└─────────────────────────────────────────┘
```

---

## 🛠️ Build Tool: Bun

All workflows use **Bun** for:
- 📦 **Dependency installation**: `bun install`
- 🔨 **Building**: `bun run build`
- ✅ **Testing**: `bun test`
- 🎨 **Linting**: `bun run lint`

**Why Bun?**
- ⚡ Faster than npm/yarn
- 🔧 Built-in TypeScript support
- 📦 Compatible with Node.js packages

---

## 🔍 Troubleshooting

### "Waiting for approval" forever

**Solution**: You need to set up the `production` environment with required reviewers (see setup step 3)

### npm publish fails with 403

**Problem**: npm token invalid or lacks permissions

**Solution**:
1. Generate new token: `npm token create --type=automation`
2. Update GitHub secret
3. Ensure token has "Automation" or "Publish" permissions

### CI checks fail

**Problem**: Build, lint, or test errors

**Solution**:
1. Check the workflow logs in Actions tab
2. Fix issues locally: `bun run build && bun test`
3. Commit fixes and re-run workflow

### Version bump fails

**Problem**: Git push permissions

**Solution**: Ensure "Read and write permissions" are enabled in Actions settings

---

## 📊 CI vs Publish Workflow

| Feature | CI Workflow | Publish Workflow |
|---------|-------------|------------------|
| **Trigger** | Automatic (push/PR) | Manual only |
| **Approval** | None | Required |
| **Version Bump** | No | Yes |
| **npm Publish** | No | Yes |
| **Node Versions** | 18, 20 | 20 only |
| **Purpose** | Quality checks | Release |

---

## 🎯 Best Practices

### Before Publishing

1. ✅ **Merge all PRs**: Ensure `main` branch is ready
2. ✅ **Update CHANGELOG**: Add notes about changes
3. ✅ **Test locally**: `bun install && bun run build && bun test`
4. ✅ **Check version**: Decide if patch/minor/major

### During Publishing

1. ⏱️ **Wait for CI**: Let all checks complete
2. 🔍 **Review logs**: Check for any warnings
3. ✅ **Approve carefully**: Double-check version bump type
4. 👀 **Watch the publish**: Monitor the workflow execution

### After Publishing

1. ✅ **Verify on npm**: `npm view adk-nodejs`
2. ✅ **Test installation**: `npm install adk-nodejs@latest`
3. ✅ **Check GitHub release**: Verify release notes
4. 📢 **Announce**: Share with users if major release

---

## 🔧 Customization

### Change Node.js Versions

Edit `.github/workflows/ci.yml`:
```yaml
strategy:
  matrix:
    node-version: [18, 20, 21]  # Add or remove versions
```

### Add More CI Checks

```yaml
- name: Check code coverage
  run: bun run coverage

- name: Security audit
  run: npm audit --audit-level=moderate
```

### Modify Auto-changelog

Edit the "Update CHANGELOG" step in `publish.yml` to customize the changelog format.

---

## 📚 Quick Reference

| Task | Command/Location |
|------|------------------|
| **Trigger publish** | Actions → Build and Publish → Run workflow |
| **Approve publish** | Actions → Click run → Review deployments |
| **Check CI status** | Actions tab → CI workflow |
| **View npm package** | `npm view adk-nodejs` |
| **Local build** | `bun run build` |
| **Local test** | `bun test` |

---

## 🎉 Summary

Your CI/CD pipeline is designed for **safety and control**:

- ✅ **Automatic CI**: Every commit is checked
- 🔒 **Manual approval**: No accidental publishes
- ⚡ **Bun-powered**: Fast builds and tests
- 📦 **Complete automation**: Version, tag, publish, release

Happy publishing! 🚀