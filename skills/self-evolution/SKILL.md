---
name: self-evolution
description: Detect improvement opportunities and propose system changes through a structured evolution workflow
---

# Self-Evolution Skill

Use this skill when Bloom detects a capability gap or the user requests a system change.

## Evolution Workflow

1. **Detect**: Recognize a capability gap or improvement opportunity
2. **Propose**: Create an evolution object documenting the change
3. **Plan**: Design the implementation approach
4. **Implement**: Make the changes
5. **Verify**: Test and validate
6. **Apply**: Deploy with user approval

## Creating an Evolution

```bash
memory_create evolution "add-health-tracking" \
  --title="Add health tracking object type" \
  --status=proposed --risk=low --area=objects
```

## Evolution Object Fields

- `status`: proposed | planning | implementing | reviewing | approved | applied | rejected
- `risk`: low | medium | high
- `area`: objects | persona | skills | containers | system

## Safety Rules

- All system changes require user approval before applying
- Always test changes before deploying
- Document what each evolution changes and why
- Keep a rollback plan for container changes
