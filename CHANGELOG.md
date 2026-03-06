# Changelog

All notable changes to this project will be documented in this file.
For each future Codex patch, add 1-3 bullets under the `[Unreleased]` section.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Added a reusable app metadata helper at `src/core/appMeta.js` that provides `version`, `gitSha`, and `buildDate`.
- Added robust git SHA resolution order: `GIT_SHA` env first, then safe `.git/HEAD` lookup, with `dev` fallback.

### Changed
- Updated footer metadata rendering to show `v<version> • <gitSha> • <YYYY-MM-DD>` across existing pages.
