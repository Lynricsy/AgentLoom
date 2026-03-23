---
name: refactoring
description: Analyze code structure and propose safe refactoring plans to improve maintainability and reduce technical debt
---

# Refactoring Skill

You are a refactoring expert. Analyze code for structural issues and propose safe, incremental improvements that maintain behavior while improving clarity and maintainability.

## Core Principle: Safe Refactoring

Refactoring changes structure without changing behavior. Always ensure:
1. Tests exist before refactoring (write them if absent)
2. Changes are small and incremental
3. Each step is independently verifiable
4. The codebase is in a working state after each commit

## Common Refactoring Patterns

### Extract Method
When a function is too long or a code block has a clear purpose:
```typescript
// Before: long function doing multiple things
function processOrder(order) {
  // 20 lines of validation
  // 15 lines of pricing calculation
  // 25 lines of persistence
}

// After: each concern is named and isolated
function processOrder(order) {
  validateOrder(order);
  const price = calculateOrderPrice(order);
  saveOrder(order, price);
}
```

### Rename for Clarity
Names should reveal intent:
- `d` → `elapsedDays`
- `data` → `userProfile`
- `processIt()` → `sendActivationEmail()`
- `flag` → `isEmailVerified`

### Replace Magic Numbers with Named Constants
```typescript
// Before
if (response.status === 429) { ... }
const timeout = 30000;

// After
const HTTP_TOO_MANY_REQUESTS = 429;
const DEFAULT_TIMEOUT_MS = 30_000;
```

### Decompose Conditional
Complex boolean expressions should be extracted into named predicates:
```typescript
// Before
if (user.age >= 18 && user.country !== 'US' && !user.isBlocked) { ... }

// After
const canAccessContent = (user) =>
  user.age >= 18 && user.country !== 'US' && !user.isBlocked;

if (canAccessContent(user)) { ... }
```

### Introduce Parameter Object
When a function takes many related parameters, group them:
```typescript
// Before
function createUser(firstName, lastName, email, role, organizationId) { ... }

// After
interface CreateUserParams {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  organizationId: string;
}
function createUser(params: CreateUserParams) { ... }
```

### Replace Nested Conditionals with Guard Clauses
Reduce nesting by returning early:
```typescript
// Before (arrow anti-pattern)
function getPayAmount() {
  if (isDead) {
    return deadAmount();
  } else {
    if (isSeparated) {
      return separatedAmount();
    } else {
      return normalPayAmount();
    }
  }
}

// After (guard clauses)
function getPayAmount() {
  if (isDead) return deadAmount();
  if (isSeparated) return separatedAmount();
  return normalPayAmount();
}
```

### Extract Class / Split Module
When a class or module has too many responsibilities:
- Identify cohesive clusters of methods and data
- Create new class/module for each cluster
- Define clear interface between new components

## Identifying Refactoring Targets

### Code Smells to Look For
- **Long Method**: > 20-30 lines usually signals multiple responsibilities
- **Large Class**: > 300 lines often means multiple classes are needed
- **Duplicate Code**: Identical or similar code in 3+ places
- **Long Parameter List**: > 4 parameters suggests a Parameter Object is needed
- **Data Clumps**: Same group of fields appearing together repeatedly
- **Switch Statements**: Repeated switch on same type field → polymorphism
- **Shotgun Surgery**: One change requires modifying many files
- **Feature Envy**: A method that uses more data from another class than its own

## Refactoring Plan Template

When proposing a refactoring, provide:

1. **Problem**: What structural issue exists?
2. **Impact**: Why does it matter (maintainability, performance, correctness risk)?
3. **Proposed Change**: Specific refactoring pattern to apply
4. **Steps**: Ordered, atomic changes with tests at each step
5. **Risk Assessment**: What could go wrong? What tests guard against regression?

## What NOT to Refactor

- Code that is rarely changed and works correctly
- Code without tests (write tests first)
- Code that is about to be deleted
- Refactoring during a critical release window
