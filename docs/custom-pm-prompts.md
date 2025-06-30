# Custom PM Prompts

Squabble allows you to customize the Product Manager's (PM) behavior by providing a custom prompt that replaces the default instructions while maintaining core functionality.

## How It Works

1. **Location**: Place your custom prompt at `.squabble/workspace/prompts/pm.md`
2. **Activation**: The custom prompt is automatically used when the file exists
3. **Security**: Prompts are validated to prevent jailbreaking attempts

## Structure

Your custom PM prompt replaces the middle section of the PM's system prompt:

```
[Core Instructions - Protected]
- You are a Senior Technical PM...
- Your tool suite...

[Your Custom Instructions - Replaceable]
- Domain expertise
- Review standards
- Prioritization rules
- Etc.

[Security Footer - Protected]
- Security reminders...
```

## Example Custom Prompts

### Fintech Domain PM

```markdown
## Domain Expertise
You specialize in fintech applications with a focus on:
- PCI compliance and payment processing requirements
- Financial regulations (SOC2, PSD2, GDPR)
- High-reliability transaction systems

## Critical Review Focus Areas
- All monetary calculations must use decimal/BigNumber
- Validate proper audit trail implementation
- Ensure data encryption at rest and in transit
```

### Gaming/Entertainment PM

```markdown
## Domain Expertise
You specialize in gaming and entertainment applications:
- Real-time multiplayer systems
- User engagement and retention metrics
- Performance optimization for 60fps gameplay

## Review Priorities
- Frame rate and latency optimization
- User experience and game feel
- Monetization without compromising gameplay
```

### Healthcare PM

```markdown
## Domain Expertise
You specialize in healthcare applications:
- HIPAA compliance requirements
- Clinical workflow optimization
- Patient data privacy and security

## Critical Review Areas
- PHI handling and access controls
- Audit logging for all data access
- Clinical accuracy and safety
```

## Creating Your Custom Prompt

1. **During init_workspace**: Use `createExamplePMPrompt: true` to generate an example
2. **Manual creation**: Create `.squabble/workspace/prompts/pm.md` with your instructions

## Security Validation

Custom prompts are validated to prevent:
- Jailbreaking attempts
- Instruction overrides
- System prompt manipulation
- Excessive length (>10KB)

Invalid prompts are rejected and default instructions are used instead.

## Best Practices

1. **Focus on domain expertise** - Add specialized knowledge for your industry
2. **Define review standards** - Set specific code quality requirements
3. **Clarify priorities** - Help PM make better prioritization decisions
4. **Keep it concise** - Avoid overly long prompts that dilute focus
5. **Test thoroughly** - Verify PM behavior matches expectations

## Troubleshooting

If your custom prompt isn't working:

1. Check the file exists at `.squabble/workspace/prompts/pm.md`
2. Look for validation errors in the console
3. Ensure the prompt doesn't contain forbidden patterns
4. Verify file permissions allow reading

## Future Enhancements

Planned features for custom prompts:
- Template library for common domains
- Variable substitution from project config
- Per-task prompt overrides
- Prompt versioning and rollback