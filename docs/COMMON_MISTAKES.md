# ❌ COMMON SQUABBLE MISTAKES - LEARN FROM FAILURES

## 🛑 CRITICAL: These mistakes WILL break your project

### ❌ MISTAKE #1: Trying to Work on Multiple Tasks

**WRONG:**
```
Engineer: get_next_task()
> Returns: Task A
Engineer: claim_task("task-a")
Engineer: get_next_task()  # ❌ VIOLATION!
> Returns: Task B
Engineer: claim_task("task-b")  # ❌ WILL FAIL!
```

**CORRECT:**
```
Engineer: get_next_task()
> Returns: Task A
Engineer: claim_task("task-a")
Engineer: [implement task A]
Engineer: submit_for_review("task-a")
PM: "Approved"
Engineer: get_next_task()  # ✅ NOW you can get next task
```

**CONSEQUENCE:** Context switching, incomplete work, project chaos

---

### ❌ MISTAKE #2: Skipping PM Review

**WRONG:**
```
Engineer: claim_task("task-123")
Engineer: [implements feature]
Engineer: # Just marks it done in their head ❌
Engineer: get_next_task()  # ❌ VIOLATION!
```

**CORRECT:**
```
Engineer: claim_task("task-123")
Engineer: [implements feature]
Engineer: submit_for_review("task-123")  # ✅ MANDATORY
PM: "Approved with minor changes needed..."
Engineer: [makes requested changes]
Engineer: submit_for_review("task-123")  # ✅ Re-submit
PM: "Approved"
```

**CONSEQUENCE:** No quality control, bugs in production, technical debt

---

### ❌ MISTAKE #3: Role Confusion

**WRONG - PM Trying to Implement:**
```
PM: "I'll just write this code myself"  # ❌ VIOLATION!
PM: Edit("src/app.ts", ...)  # ❌ PMs DON'T CODE!
```

**WRONG - Engineer Self-Approving:**
```
Engineer: submit_for_review("task-123")
Engineer: "Looks good to me!"  # ❌ CAN'T APPROVE OWN WORK!
Engineer: get_next_task()  # ❌ MUST WAIT FOR PM!
```

**CORRECT:**
```
Engineer: submit_for_review("task-123")
[BLOCKING - Wait for PM response]
PM: "Code review complete. Approved."
Engineer: get_next_task()  # ✅ NOW can continue
```

**CONSEQUENCE:** No separation of concerns, quality compromise

---

### ❌ MISTAKE #4: Shallow Understanding Without Research

**WRONG:**
```
Engineer: claim_task("implement-oauth")
Engineer: "I think I know OAuth..."  # ❌ NO RESEARCH!
Engineer: [implements based on memory]  # ❌ DANGEROUS!
```

**CORRECT:**
```
Engineer: get_next_task()
> Returns: "implement-oauth"
Engineer: WebSearch("OAuth 2.0 best practices 2024")  # ✅ RESEARCH FIRST
Engineer: WebSearch("OAuth security vulnerabilities")  # ✅ DEEP DIVE
Engineer: consult_pm("Based on research, I found...")  # ✅ DISCUSS FINDINGS
PM: "Good research. Proceed with PKCE flow."
Engineer: claim_task("implement-oauth")
```

**CONSEQUENCE:** Security vulnerabilities, poor implementation, rework

---

### ❌ MISTAKE #5: Surface-Level Code Review

**WRONG PM Review:**
```
PM: Read("src/auth.ts")
PM: "Code looks fine!"  # ❌ NO DEPTH!
PM: "Approved"  # ❌ DANGEROUS!
```

**CORRECT PM Review:**
```
PM: Read("src/auth.ts")
PM: WebSearch("JWT security best practices")  # ✅ VERIFY STANDARDS
PM: Grep("TODO|FIXME|XXX")  # ✅ CHECK FOR ISSUES
PM: Bash("npm run test")  # ✅ RUN TESTS
PM: Bash("npm run lint")  # ✅ CHECK QUALITY
PM: "Found issues: No rate limiting, JWT expiry too long..."
```

**CONSEQUENCE:** Bugs slip through, security issues, poor quality

---

### ❌ MISTAKE #6: Implementing Without PM Consultation

**WRONG:**
```
Engineer: get_next_task()
> Returns: "Add user authentication"
Engineer: claim_task("add-auth")  # ❌ NO CONSULTATION!
Engineer: [implements entire auth system]  # ❌ ASSUMPTIONS!
```

**CORRECT:**
```
Engineer: get_next_task()
> Returns: "Add user authentication"
Engineer: consult_pm("For user auth, should we use...")  # ✅ ASK FIRST
PM: "Use JWT with refresh tokens, 15min expiry..."
Engineer: claim_task("add-auth")  # ✅ NOW claim
```

**CONSEQUENCE:** Wrong implementation, wasted effort, requirement mismatch

---

### ❌ MISTAKE #7: Modifying Task List Directly

**WRONG:**
```
Engineer: "This task needs to be split..."
Engineer: [mentally splits task]  # ❌ NO AUTHORITY!
Engineer: "I'll work on the first part"  # ❌ VIOLATION!
```

**CORRECT:**
```
Engineer: propose_modification({
  reason: "Task too large",
  modifications: [{
    type: "SPLIT",
    taskId: "task-123",
    details: { /* split details */ }
  }]
})
PM: "Good idea. Approved."
Engineer: get_next_task()  # ✅ Now get updated task
```

**CONSEQUENCE:** Task tracking broken, PM loses control, chaos

---

### ❌ MISTAKE #8: Continuing After Changes Requested

**WRONG:**
```
Engineer: submit_for_review("task-123")
PM: "Changes needed: Add error handling"
Engineer: get_next_task()  # ❌ MUST FIX FIRST!
```

**CORRECT:**
```
Engineer: submit_for_review("task-123")
PM: "Changes needed: Add error handling"
Engineer: [adds error handling]  # ✅ ADDRESS FEEDBACK
Engineer: submit_for_review("task-123")  # ✅ RE-SUBMIT
PM: "Approved"
Engineer: get_next_task()  # ✅ NOW continue
```

**CONSEQUENCE:** Incomplete work, quality issues pile up

---

### ❌ MISTAKE #9: No Plan for Complex Tasks

**WRONG:**
```
Task: "Refactor entire authentication system"
Engineer: claim_task("refactor-auth")  # ❌ NO PLAN!
Error: "Task requires implementation plan"
```

**CORRECT:**
```
Task: "Refactor entire authentication system" (requiresPlan: true)
Engineer: [claim_task generates template]
Engineer: [completes implementation plan]
Engineer: claim_task("refactor-auth")  # ✅ WITH PLAN
PM: "Plan approved. Proceed."
```

**CONSEQUENCE:** Poor planning, missed requirements, scope creep

---

### ❌ MISTAKE #10: Ignoring Tool Hints

**WRONG:**
```
Tool hint: "⚠️ BLOCKING: Execution stops until PM responds"
Engineer: submit_for_review()
Engineer: "I'll just keep working..."  # ❌ IGNORING BLOCKING!
```

**CORRECT:**
```
Tool hint: "⚠️ BLOCKING: Execution stops until PM responds"
Engineer: submit_for_review()
Engineer: [STOPS AND WAITS]  # ✅ RESPECTS BLOCKING
PM: "Approved"
Engineer: [NOW continues]  # ✅ PROPER SEQUENCE
```

**CONSEQUENCE:** Workflow violations cascade, system breaks down

---

## 🎯 REMEMBER: THERE IS ONLY ONE WAY

The Squabble workflow is not flexible. It is not optional. Follow it exactly or face project failure.

**THE SEQUENCE IS ALWAYS:**
1. Research (WebSearch)
2. Consult (consult_pm)
3. Get task (get_next_task)
4. Claim task (claim_task)
5. Implement
6. Submit (submit_for_review) - BLOCKING
7. Wait for PM
8. Address feedback or continue

**NO SHORTCUTS. NO EXCEPTIONS. NO INTERPRETATIONS.**