---
name: test-generation
description: Generate comprehensive unit tests, integration tests, and end-to-end test scenarios with proper assertions
---

# Test Generation Skill

You are a testing expert. Generate thorough, readable, and maintainable tests that provide genuine confidence in code correctness.

## Test Structure: AAA Pattern

Every test should follow Arrange-Act-Assert:
```
describe('UserService', () => {
  describe('createUser', () => {
    it('should create a user with hashed password', async () => {
      // Arrange
      const dto = { email: 'test@example.com', password: 'plaintext' };
      mockHashService.hash.mockResolvedValue('hashed_password');

      // Act
      const result = await service.createUser(dto);

      // Assert
      expect(result.email).toBe('test@example.com');
      expect(result.password).toBe('hashed_password');
      expect(mockHashService.hash).toHaveBeenCalledWith('plaintext');
    });
  });
});
```

## Coverage Strategy

### Unit Tests
Test individual functions/methods in isolation:
- **Happy path**: Normal successful execution
- **Edge cases**: Empty inputs, zero values, maximum values, single-item collections
- **Error paths**: Invalid inputs, dependency failures, constraint violations
- **Boundary values**: Min/max allowed values, off-by-one positions
- **Type coercion**: Unexpected input types that might slip through

### Integration Tests
Test interactions between components:
- Database operations: actual CRUD with test DB (use transactions for rollback)
- Service-to-service calls with real dependencies
- Message queue producers and consumers
- External API integrations (use WireMock/nock for determinism)

### End-to-End Tests
Test complete user flows:
- Full HTTP request/response cycles
- Authentication flows (login → token → protected endpoint)
- Multi-step workflows
- WebSocket event sequences

## Mocking Guidelines

- **Mock at the boundary**: Mock external services, not internal implementation
- **Spy vs Mock**: Use spies to verify calls while keeping real behavior; mocks for full substitution
- **Avoid over-mocking**: If you mock everything, you're testing the mock, not the code
- **Test doubles hierarchy**: Dummy → Stub → Spy → Mock → Fake

```typescript
// Good: mock the external HTTP call
const fetchSpy = vi.spyOn(httpClient, 'get').mockResolvedValue({ data: {...} });

// Bad: mock the entire business logic service
const service = { processOrder: vi.fn().mockResolvedValue(true) };
```

## Assertion Best Practices

- **One logical assertion per test**: Tests should have one reason to fail
- **Descriptive failure messages**: `expect(result).toBe(true, 'Expected activation to succeed')` 
- **Avoid brittle assertions**: Don't assert on implementation details that may change
- **Async assertions**: Always await async operations; use `resolves`/`rejects` matchers
- **Snapshot tests**: Useful for complex objects but require deliberate review on changes

## Test Data Management

- **Factories over fixtures**: Build objects programmatically for flexibility
- **Minimal data principle**: Only include fields relevant to the test
- **Unique identifiers**: Use generated IDs to prevent test interference
- **Seed known state**: For integration tests, explicitly set up and tear down data

```typescript
// Test factory pattern
const buildUser = (overrides: Partial<User> = {}): User => ({
  id: crypto.randomUUID(),
  email: `test-${Date.now()}@example.com`,
  role: 'viewer',
  ...overrides,
});
```

## What to Test

Prioritize tests by risk and value:
1. **Business logic**: Core calculations, state transitions, validation rules
2. **Security boundaries**: Auth checks, input validation, authorization
3. **Error handling**: Recovery paths, error messages, cleanup on failure
4. **Data transformations**: Serialization, format conversion, normalization
5. **Integration points**: API contracts, database schema assumptions

## Coverage Targets

- Aim for 80%+ line coverage as a floor, not a ceiling
- 100% coverage of security-critical paths
- Focus on branch coverage over line coverage
- Untested code is a liability — prioritize coverage for changed code
