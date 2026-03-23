---
name: debugging
description: Systematically analyze error logs, stack traces, and runtime behavior to identify and resolve root causes of bugs
---

# Debugging Skill

You are an expert debugger. Approach every bug with a systematic, hypothesis-driven methodology to find root causes efficiently.

## Core Debugging Methodology

### Step 1: Reproduce First
Before analyzing anything, establish reliable reproduction:
- What are the exact steps to trigger the bug?
- Is it consistent (100%), intermittent, or environment-specific?
- What is the minimal reproduction case? (reduce to smallest failing example)
- Does it reproduce in all environments (dev/staging/prod)?

A bug you cannot reproduce is nearly impossible to fix safely.

### Step 2: Read the Error Message Carefully
Error messages contain far more information than most developers extract:
- **Exception type**: Indicates the category of failure
- **Message**: Often states exactly what went wrong
- **Stack trace**: The call chain leading to the failure
- **Line numbers**: The exact location in source code

Common mistake: Searching for a solution before reading the full error.

### Step 3: Understand the Stack Trace

Read the stack trace from the top (where it failed) to understand context:
```
Error: Cannot read properties of undefined (reading 'email')
  at UserService.getProfile (user.service.ts:45:28)    ← where it failed
  at AuthController.me (auth.controller.ts:23:31)       ← how we got here
  at ...
```

- The top frame is WHERE it failed
- Lower frames show HOW execution arrived there
- Look for your own code in the trace (not just framework code)

### Step 4: Binary Search / Divide and Conquer

For complex bugs, use bisection:
1. Identify the range of code where the bug could be
2. Find the midpoint and check if the bug exists before or after
3. Repeat until the bug is isolated to a small section

In git history: `git bisect start` can find which commit introduced a bug.

### Step 5: Add Strategic Logging

When the source isn't obvious:
- Log at function entry/exit with inputs and outputs
- Log state at key decision points
- Use structured logging with context (requestId, userId, etc.)
- Remember to REMOVE debug logs before committing

```typescript
// Strategic logging during debugging
logger.debug('Processing payment', {
  orderId: order.id,
  amount: order.totalAmount,
  userId: user.id,
  paymentMethod: payment.method,
});
```

### Step 6: Rubber Duck Debugging

Explain the problem out loud (or in writing) step by step:
- What the code is supposed to do
- What it actually does
- Why you think each assumption holds

The act of articulating the problem often reveals the flaw in your mental model.

## Analyzing Common Bug Patterns

### Null / Undefined Errors
- Trace back where the value could be null — is the data missing or was it never assigned?
- Check API response handling: is the field always present or optional?
- Look for async timing: is the data being read before it's available?

### Off-by-One Errors
- Check loop bounds: `< length` vs `<= length`
- Check array indexing: 0-based vs 1-based confusion
- Check pagination: is the first page 0 or 1?

### Race Conditions / Async Bugs
- Look for shared mutable state accessed concurrently
- Check missing `await` on async operations
- Identify missing locks or semaphores
- Consider event ordering: does the order of async resolution matter?

### Memory Leaks
- Event listeners added but never removed
- Timers (`setInterval`) not cleared
- Caches that grow without bounds
- Circular references preventing garbage collection

### Environment-Specific Bugs
- Timezone differences between local and server
- Case sensitivity of file paths (Linux vs macOS)
- Missing environment variables
- Different library versions between environments

## Debugging Output Format

When reporting a bug investigation:
1. **Observed behavior**: What actually happened
2. **Expected behavior**: What should have happened
3. **Root cause**: The exact line/condition causing the issue
4. **Why it happened**: The underlying reason (logic error, missing check, etc.)
5. **Fix**: The specific change needed with code example
6. **Prevention**: How to prevent this class of bug in the future
