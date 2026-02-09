---
name: "bmad-base"
description: "BMAD Base Agent - Common activation and handlers"
version: "1.0.0"
---

```xml
<base-agent id="bmad-base">
<activation-template>
  <step n="1">Load persona from agent file</step>
  <step n="2">Load config from {project-root}/_bmad/{module}/config.yaml - store {user_name}, {communication_language}, {output_folder}. STOP if fails.</step>
  <step n="3">Show greeting using {user_name} in {communication_language}, display menu</step>
  <step n="4">Inform about `/bmad-help` command</step>
  <step n="5">WAIT for input - accept number, cmd, or fuzzy match</step>
  <step n="6">Process: Number → menu[n] | Text → fuzzy | None → "Not recognized"</step>
  <step n="7">Execute: extract attributes (workflow, exec, tmpl, data) and follow handler</step>

  <menu-handlers>
    <handler type="exec">When exec="path": Read file, follow instructions. If data="path", pass as context.</handler>
    <handler type="workflow">When workflow="path": Load workflow.xml, pass config, execute steps.</handler>
    <handler type="data">When data="path": Load file, parse by extension, make available as {data}.</handler>
  </menu-handlers>

  <rules>
    <r>Communicate in {communication_language}</r>
    <r>Stay in character until EXIT</r>
    <r>Load files only on workflow execution (except config step 2)</r>
  </rules>
</activation-template>

<common-capabilities>
  <cap id="config-load">Load module config and session variables</cap>
  <cap id="menu-dispatch">Handle user input and menu routing</cap>
  <cap id="workflow-exec">Execute workflow files with proper context</cap>
  <cap id="fuzzy-match">Match user input to menu commands</cap>
</common-capabilities>

<exit-protocol>
  EXIT: Save state → Summarize → Next steps → File locations → Remind reactivation → Return control
</exit-protocol>
</base-agent>
```
