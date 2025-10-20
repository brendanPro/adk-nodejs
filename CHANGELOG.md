# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2025-01-20

### Added
- **Local LLM Support**: Complete integration for local language models
  - `LocalLlm`: Base class for any local LLM server
  - `OllamaLlm`: Specialized implementation for Ollama
  - `LMStudioLlm`: Specialized implementation for LM Studio
- **Documentation**: Comprehensive guides added
  - `AGENTS.md`: Complete agent development guide
  - `LOCAL-LLM-GUIDE.md`: Local LLM integration guide
  - `INSTALLATION.md`: Installation and setup instructions
  - `PUBLISHING.md`: Package publishing guide
- **Examples**: Ready-to-use example files
  - `example-ollama.ts`: Ollama integration example
  - `example-lmstudio.ts`: LM Studio integration example
  - `exemple.ts`: Gemini integration example
- **Registry System**: Proper `LlmRegistry` export through main index
- **Build Tools**: Added `.npmignore` for cleaner package distribution

### Fixed
- **Context Services**: Fixed `BaseAgent.createInvocationContext()` to properly preserve services from parent context
- **Export Conflicts**: Resolved `LlmRegistry` naming conflict between static and instance-based implementations

### Changed
- **Package Metadata**: Updated description and repository information
- **README**: Added fork attribution to [kodart/adk-nodejs](https://github.com/kodart/adk-nodejs)
- **Version**: Bumped from 1.0.0 to 1.1.0

## [1.0.0] - 2025-01-19

### Added
- Initial release based on [kodart/adk-nodejs](https://github.com/kodart/adk-nodejs)
- Core agent framework with TypeScript support
- Event-driven architecture
- LLM integration with Gemini support
- Tool system with function calling
- Session management
- Flow processors (SingleFlow, AutoFlow)
- Comprehensive test suite
- Basic documentation

### Infrastructure
- TypeScript configuration
- Jest testing setup
- ESLint and Prettier configuration
- Package structure and build system

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.1.0 | 2025-01-20 | Local LLM support and documentation |
| 1.0.0 | 2025-01-19 | Initial release |

---

## Links

- [GitHub Repository](https://github.com/brendanPro/adk-nodejs)
- [npm Package](https://www.npmjs.com/package/adk-nodejs)
- [Original Fork](https://github.com/kodart/adk-nodejs)
- [Issues](https://github.com/brendanPro/adk-nodejs/issues)

---

## How to Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Release Process

This project uses automated releases through GitHub Actions. See [.github/WORKFLOWS.md](.github/WORKFLOWS.md) for details.
