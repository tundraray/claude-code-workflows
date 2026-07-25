---
name: typescript-testing-backend
description: This skill provides backend testing rules with Vitest, real DB/API integration patterns, and service-level testing conventions. Automatically loaded when writing backend tests, reviewing test quality, or when "backend test", "service test", "API test", "integration test", "database test", or "backend test coverage" are mentioned.
---

# TypeScript Testing Rules (Backend)

## Test Framework

- **Vitest**: Primary test runner
- **Supertest**: For HTTP endpoint testing
- **fast-check**: For property-based testing
- Test imports: `import { describe, it, expect, beforeEach, vi } from 'vitest'`
- Mock creation: Use `vi.mock()`

## Basic Testing Policy

### Quality Requirements

- **Coverage**: Assert the named acceptance result, public branch, or failure state on critical paths and high-reuse units. Treat coverage as a signal for finding untested areas, not as a target — a target gets gamed into trivial tests. Any enforced numeric threshold is the project's CI/coverage config, not a goal in itself.
- **Independence**: Each test can run independently without depending on other tests
- **Reproducibility**: Control time, randomness, environment values, and external responses so identical inputs produce the same observable result
- **Readability**: Each test names one behavior, separates arrange/act/assert, and keeps fixtures limited to values used by that behavior

### Where to concentrate test rigor

Cover public branches, error states, and boundary contracts on units whose regression blast radius is widest. Read coverage reports as a map of where to look first, in roughly this order of payoff:

- **Services (business logic)** and **Utils/Helpers** — highest reuse, most branch logic; a gap here is almost always a real finding
- **Guards/Interceptors/Pipes** — cross-cutting, so a defect reaches every route that uses them
- **Controllers (API layer)** — thin by design; verify contract shape and error mapping rather than chasing a number
- **Repositories (data access)** — concentrate on custom query methods; generated CRUD rarely repays unit tests and is better served by integration tests

**Metrics** (what coverage reports break down): Statements, Branches, Functions, Lines

### Test Types and Scope

1. **Unit Tests**
   - Verify behavior of individual services, functions, or classes
   - Mock all external dependencies (DB, APIs, message queues)
   - Most numerous, implemented with fine granularity
   - Focus on business logic correctness

2. **Integration Tests**
   - Verify coordination between layers (Controller → Service → Repository)
   - Use real database (test instance) or in-memory database
   - Use real HTTP through Supertest
   - Test API contracts end-to-end within the service

3. **Property-Based Tests (fast-check)**
   - Verify invariants hold across random inputs
   - Use for: parsers, validators, serializers, mathematical operations
   - Complement example-based tests — do not replace them

## Red-Green-Refactor Process (Test-First Development)

**Recommended Principle**: Always start code changes with tests

**Development Steps**:
1. **Red**: Write test for expected behavior (it fails)
2. **Green**: Pass test with minimal implementation
3. **Refactor**: Improve code while maintaining passing tests

**NG Cases (Test-first not required)**:
- Pure configuration file changes (nest-cli.json, ormconfig.ts, etc.)
- Documentation-only updates
- Emergency production incident response (post-incident tests mandatory)

## Test Design Principles

### Test Case Structure

- Tests consist of three stages: "Arrange," "Act," "Assert"
- Clear naming that shows purpose of each test
- One test case verifies only one behavior

### Test Data Management

- Manage test data in `__tests__/` directories or co-located with source
- Use factory functions or builder patterns for test data creation
- Always mock sensitive information (API keys, credentials)
- Keep test data minimal — only data directly related to test verification
- Use database fixtures or seeding for integration tests

### Mock and Stub Usage Policy

**Recommended: Mock external dependencies in unit tests**
- Mock database connections, external API clients, message queues
- Mock at the boundary — not internal functions

**For integration tests: Use real dependencies**
- Real database (test instance or in-memory like SQLite)
- Real HTTP stack through Supertest
- Mock only truly external services (third-party APIs)

### Test Failure Response Decision Criteria

**Fix tests**: Wrong expected values, implementation detail coupling, flaky assertions
**Fix implementation**: Valid business rules, edge cases, contract violations
**When in doubt**: Confirm with user

## Test Implementation Conventions

### Directory Structure

```
src/
├── users/
│   ├── users.service.ts
│   ├── users.controller.ts
│   ├── __tests__/
│   │   ├── users.service.test.ts
│   │   ├── users.controller.test.ts
│   │   └── users.integration.test.ts
│   └── index.ts
```

**Rationale**:
- `__tests__/` directory convention for backend projects
- Clear separation between unit and integration tests
- Easy to find and maintain tests alongside implementation

### Naming Conventions

- Test files: `{module}.{layer}.test.ts` (e.g., `users.service.test.ts`)
- Integration test files: `{feature}.integration.test.ts`
- Test suites: Names describing target module or feature
- Test cases: Names describing expected behavior from caller perspective

### Test Code Quality Rules

**Recommended: Keep all tests always active**
- Fix problematic tests and activate them

**Avoid: `test.skip()` or commenting out**
- Creates test gaps and incomplete quality checks
- Solution: Completely delete unnecessary tests

## Service Testing Patterns

### Unit Testing Services

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserService } from '../users.service'

describe('UserService', () => {
  let service: UserService
  let mockRepository: { findOne: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockRepository = {
      findOne: vi.fn(),
      save: vi.fn(),
    }
    service = new UserService(mockRepository as any)
  })

  it('should return user when found', async () => {
    const expectedUser = { id: '1', name: 'John', email: 'john@example.com' }
    mockRepository.findOne.mockResolvedValue(expectedUser)

    const result = await service.findById('1')

    expect(result).toEqual(expectedUser)
    expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: '1' } })
  })

  it('should throw NotFoundError when user not found', async () => {
    mockRepository.findOne.mockResolvedValue(null)

    await expect(service.findById('999')).rejects.toThrow(NotFoundError)
  })
})
```

### Integration Testing with Supertest

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../app'

describe('POST /api/users', () => {
  let app: Express

  beforeAll(async () => {
    app = await createApp({ database: 'test' })
  })

  afterAll(async () => {
    await app.close()
  })

  it('should create user and return 201', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ name: 'Jane', email: 'jane@example.com' })
      .expect(201)

    expect(response.body).toMatchObject({
      name: 'Jane',
      email: 'jane@example.com',
    })
    expect(response.body.id).toBeDefined()
  })

  it('should return 400 for invalid email', async () => {
    await request(app)
      .post('/api/users')
      .send({ name: 'Jane', email: 'not-an-email' })
      .expect(400)
  })
})
```

### Property-Based Testing with fast-check

```typescript
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { parseUserId } from '../utils/parse-user-id'

describe('parseUserId', () => {
  it('should round-trip: format(parse(id)) === id for valid UUIDs', () => {
    fc.assert(
      fc.property(fc.uuid(), (uuid) => {
        const parsed = parseUserId(uuid)
        expect(parsed.toString()).toBe(uuid)
      })
    )
  })

  it('should reject non-UUID strings', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !isValidUuid(s)),
        (invalidId) => {
          expect(() => parseUserId(invalidId)).toThrow()
        }
      )
    )
  })
})
```

## Test Quality Criteria

### Literal Expected Values

Use hardcoded literal values for assertions:
```typescript
expect(calculatePrice(100, 0.1)).toBe(110)
expect(formatDate(new Date('2025-01-15'))).toBe('2025-01-15')
expect(user.role).toBe('admin')
```

### Result-Based Verification

Verify final results and outcomes:
```typescript
expect(mockRepository.save).toHaveBeenCalledWith({ name: 'test', email: 'test@example.com' })
expect(result).toEqual({ id: '1', status: 'created' })
expect(response.statusCode).toBe(201)
```

### Meaningful Assertions

Every test must include at least one `expect()` that validates observable behavior.

### Appropriate Mock Scope

Mock only direct external I/O dependencies. Internal utilities use real implementations:
```typescript
vi.mock('../repositories/user.repository') // External I/O — mock
vi.mock('../clients/email.client')          // External API — mock
// Internal validators, formatters, mappers — use real implementations
```

## Database Testing Patterns

### Test Database Setup

- Use separate test database instance or in-memory alternative
- Run migrations before test suite
- Clean data between tests (truncate or transaction rollback)
- Seed with minimal required data per test

### Transaction Rollback Pattern

```typescript
beforeEach(async () => {
  await dataSource.query('BEGIN')
})

afterEach(async () => {
  await dataSource.query('ROLLBACK')
})
```

### Avoid Shared State

- Each test creates its own data
- Never depend on data created by another test
- Use unique identifiers to prevent collision in parallel runs
