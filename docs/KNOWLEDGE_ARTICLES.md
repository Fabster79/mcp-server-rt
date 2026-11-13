# Knowledge Article Management for RT MCP

## Overview

This fork extends the official Request Tracker MCP server
with knowledge article management using RT REST 2.0.

Tested with Request Tracker 6.0.4.

## New MCP tools

| Tool | Description |
|---|---|
| search_knowledge_articles | Search articles by title |
| get_knowledge_article | Read article including Content and ETag |
| create_knowledge_article | Create a knowledge article |
| update_knowledge_article | Update an existing article with ETag protection |

## Knowledge article structure

Articles use the RT Knowledge Base.

The article body is stored in the Content custom field.

Required data for creation:
- Name
- Summary
- Content

The default article class is General (ID 1).

## Concurrent update protection

get_knowledge_article returns the ETag header.

update_knowledge_article requires the ETag obtained
when the article was read.

The update sends the If-Match HTTP header.

If the article was modified in the meantime,
RT can reject the update with HTTP 412.

The client must retrieve the latest article before
preparing a new update.

## Security

- Store API tokens outside the Git repository.
- Request user approval before write operations.
- Never automatically retry version conflicts.
- Do not replace article content without reviewing it.
- Use RT permissions to restrict write operations.

## Testing

Run tests and build inside a Node.js container:

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e npm_config_cache=/tmp/npm-cache \
  -v "$PWD:/app" \
  -w /app \
  node:22-alpine \
  sh -c "npm test && npm run build"

Automated test suite: 293 tests passed as of 2026-11-13.

## Development environment

- RT 6.0.4
- PostgreSQL 17
- Docker Compose
- Ubuntu WSL2
- VS Code GitHub Copilot
- Node.js 22 build container

## Status

Knowledge article search, read, create and update have
been verified with GitHub Copilot against a local RT instance.

Automated tests pass.

The final live If-Match conflict test must be recorded
before considering concurrency protection fully verified.
