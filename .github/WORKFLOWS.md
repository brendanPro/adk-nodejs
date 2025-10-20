# GitHub Actions Workflows

This repository uses GitHub Actions for automated CI/CD. Here's how the workflows are organized:

## 🔄 Available Workflows

### 1. **CI Workflow** (`ci.yml`)
**Triggers**: Pull requests and non-main branch pushes

**What it does**:
- ✅ Runs on Node.js 18 and 20 to ensure compatibility
- ✅ Installs dependencies with Bun
- ✅ Runs linter
- ✅ Runs tests
- ✅ Builds the project
- ✅ Verifies the build output
- ✅ Tests that the package can be imported

**Purpose**: Ensures code quality before merging to main

---

### 2. **Build, Version, and Publish Workflow** (`publish.yml`)
**Triggers**: 
- Pushes to `main` branch (automatic)
- Manual workflow dispatch (with version selection)

**What it does**:
1. **Build & Test Phase**:
   - Installs dependencies
   - Runs linter and tests
   - Builds the project
   - Verifies build output

2. **Version & Publish Phase**:
   - Automatically determines version bump type from commit message
   - Bumps the version in `package.json`
   - Commits the version change
   - Creates a Git tag
   - Publishes to npm
   - Creates a GitHub release

**Version Bump Logic**:
- **Major** (`1.0.0` → `2.0.0`): Commit contains "breaking" or "major"
- **Minor** (`1.0.0` → `1.1.0`): Commit contains "feat", "feature", or "minor"
- **Patch** (`1.0.0` → `1.0.1`): Default for all other commits

---

## 🚀 How to Use

### Automatic Publishing (Recommended)

Simply push to the `main` branch with a descriptive commit message:

```bash
# For a patch release (bug fixes)
git commit -m "fix: resolve issue with LLM registry"
git push origin main

# For a minor release (new features)
git commit -m "feat: add support for Claude models"
git push origin main

# For a major release (breaking changes)
git commit -m "breaking: remove deprecated API methods"
git push origin main
```

The workflow will:
1. ✅ Build and test your code
2. ✅ Automatically bump the version
3. ✅ Publish to npm
4. ✅ Create a GitHub release

---

### Manual Publishing

You can also manually trigger a publish with a specific version bump:

1. Go to **Actions** tab in GitHub
2. Select **"Build, Version, and Publish"** workflow
3. Click **"Run workflow"**
4. Choose version bump type:
   - `patch` - Bug fixes (1.0.0 → 1.0.1)
   - `minor` - New features (1.0.0 → 1.1.0)
   - `major` - Breaking changes (1.0.0 → 2.0.0)
5. Click **"Run workflow"**

---

## 🔐 Required Secrets

You need to set up the following secrets in your GitHub repository:

### 1. `NPM_TOKEN`

**Required for**: Publishing to npm

**How to get it**:
```bash
# Login to npm
npm login

# Generate a token (Automation type recommended)
npm token create --type=automation
```

**How to add it**:
1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `NPM_TOKEN`
5. Value: Your npm token
6. Click "Add secret"

### 2. `GITHUB_TOKEN`

**Required for**: Creating releases

**How to set it up**:
- This is automatically provided by GitHub Actions
- No manual setup needed
- Ensure "Read and write permissions" are enabled:
  1. Settings → Actions → General
  2. Workflow permissions → "Read and write permissions"
  3. Save

---

## 📋 Workflow Files

| File | Purpose | Trigger |
|------|---------|---------|
| `ci.yml` | Continuous Integration | PRs and feature branches |
| `publish.yml` | Build, version, and publish | Main branch pushes |
| `webpack.yml` | Legacy webpack config | (if still needed) |

---

## 🛠️ Customization

### Changing Version Bump Rules

Edit `.github/workflows/publish.yml`, find the "Determine version bump type" step:

```yaml
- name: Determine version bump type
  id: bump-type
  run: |
    COMMIT_MSG=$(git log -1 --pretty=%B)
    if echo "$COMMIT_MSG" | grep -qiE "breaking|major"; then
      echo "type=major" >> $GITHUB_OUTPUT
    elif echo "$COMMIT_MSG" | grep -qiE "feat|feature|minor"; then
      echo "type=minor" >> $GITHUB_OUTPUT
    else
      echo "type=patch" >> $GITHUB_OUTPUT
    fi
```

Modify the `grep` patterns to match your commit conventions.

### Changing Node.js Versions

Edit `.github/workflows/ci.yml`:

```yaml
strategy:
  matrix:
    node-version: [18, 20]  # Add or remove versions
```

### Adding More Checks

Add steps before the publish phase:

```yaml
- name: Check code coverage
  run: bun run coverage

- name: Run security audit
  run: npm audit --audit-level=moderate

- name: Check for outdated dependencies
  run: npm outdated || true
```

---

## 🐛 Troubleshooting

### Publishing Fails

**Error**: `npm ERR! code ENEEDAUTH`
- **Solution**: Check that `NPM_TOKEN` secret is set correctly

**Error**: `npm ERR! 403 Forbidden`
- **Solution**: Ensure your npm token has "Automation" or "Publish" permissions

### Version Bump Not Working

**Error**: `fatal: unable to access... Permission denied`
- **Solution**: Ensure workflow has write permissions (Settings → Actions → General)

### Build Fails in CI but Works Locally

**Common causes**:
- Environment variables not set in GitHub Actions
- Different Node.js versions
- Missing dependencies

**Solution**: Check the build logs in Actions tab for specific errors

---

## 📚 Best Practices

1. **Use Conventional Commits**: Structure your commit messages
   ```
   feat: add new feature
   fix: resolve bug
   docs: update documentation
   chore: maintenance tasks
   ```

2. **Test Locally First**: Always test your changes locally before pushing to main

3. **Review the Build Logs**: Check Actions tab after each push

4. **Semantic Versioning**: Follow semver principles
   - MAJOR: Breaking changes
   - MINOR: New features (backward compatible)
   - PATCH: Bug fixes

5. **Keep Secrets Secure**: Never commit tokens or secrets to the repository

---

## 🎯 Quick Reference

| Action | Command |
|--------|---------|
| Push with auto-versioning | `git push origin main` |
| Manual workflow trigger | GitHub → Actions → Run workflow |
| Check workflow status | GitHub → Actions tab |
| View published package | `npm view adk-nodejs` |
| Install specific version | `npm install adk-nodejs@1.1.0` |

---

## 📦 Example Workflow

```bash
# 1. Make changes
git checkout -b feature/new-llm-support
# ... make changes ...

# 2. Commit with conventional commit message
git commit -m "feat: add OpenAI integration"

# 3. Push and create PR
git push origin feature/new-llm-support
# Create PR on GitHub

# 4. CI runs automatically on PR
# ✅ Build, test, lint

# 5. Merge PR to main
# Automatic publish workflow runs:
# ✅ Build & test
# ✅ Version bump (minor, because "feat")
# ✅ Publish to npm
# ✅ Create GitHub release

# 6. Users can now install the new version!
npm install adk-nodejs
```

---

Your automated CI/CD pipeline is ready! 🚀
