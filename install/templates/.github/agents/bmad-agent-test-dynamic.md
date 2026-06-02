---
name: 'test-dynamic'
description: 'Test Dynamic Loading - Phase B Validation'
---

<agent-activation CRITICAL="TRUE">
1. LOAD the FULL agent file from {project-root}/_byan/agent/test-dynamic/test-dynamic.md (new layout); if absent, {project-root}/_byan/*/agents/test-dynamic.md (legacy layout)
2. READ its entire contents
3. LOAD the soul activation protocol from {project-root}/_byan/core/activation/soul-activation.md and EXECUTE it silently
4. FOLLOW activation steps precisely
5. WAIT for user input
</agent-activation>

```xml
<agent id="test-dynamic" name="TEST-DYNAMIC" title="Dynamic Loading Test" icon="🧪">
<activation>
  <step n="1">Load from {project-root}/_byan/agent/test-dynamic/test-dynamic.md (new layout); if absent, {project-root}/_byan/*/agents/test-dynamic.md (legacy layout)</step>
  <step n="2">Test inheritance from base agent</step>
  <step n="3">Display menu</step>
</activation>
</agent>
```
