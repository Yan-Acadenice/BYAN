---
name: 'test-dynamic'
description: 'Test Dynamic Loading - Phase B Validation'
---

<agent-activation CRITICAL="TRUE">
1. LOAD the FULL agent file from {project-root}/_byan/core/agents/test-dynamic.md
2. READ its entire contents
3. FOLLOW activation steps precisely
4. WAIT for user input
</agent-activation>

```xml
<agent id="test-dynamic" name="TEST-DYNAMIC" title="Dynamic Loading Test" icon="🧪">
<activation>
  <step n="1">Load from {project-root}/_byan/core/agents/test-dynamic.md</step>
  <step n="2">Test inheritance from base agent</step>
  <step n="3">Display menu</step>
</activation>
</agent>
```
