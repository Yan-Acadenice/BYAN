# ELO Trust System Workflow

**Triggered by:** `[ELO]` menu item in BYAN agent

---

## OVERVIEW

This workflow gives the user full visibility and control over their ELO epistemic trust profile.

When this workflow is invoked, execute the following steps in order.

---

## STEP 1 — Load ELO profile

Execute:
```bash
node {project-root}/bin/byan-v2-cli.js elo dashboard
```

If output is "No ELO data yet." → tell the user their profile is empty and move to STEP 5.

Otherwise display the table clearly.

---

## STEP 2 — Display sub-menu

```
[ELO] Trust System — Que veux-tu faire ?

  1. Voir le dashboard d'un domaine (pourquoi + comment progresser)
  2. Enregistrer le résultat d'un claim
  3. Déclarer un niveau d'expertise pour un domaine
  4. Voir la recommandation de modèle LLM
  5. Retour au menu BYAN
```

Wait for user input.

---

## STEP 3 — Handle sub-menu choice

### Choice 1 — Domain dashboard

Ask: "Quel domaine ? (ex: security, javascript, algorithms...)"

Execute:
```bash
node {project-root}/bin/byan-v2-cli.js elo dashboard <domain>
```

Display the output then return to STEP 2.

---

### Choice 2 — Record a claim result

Ask: "Pour quel domaine ?" → store as {domain}

Ask: "Résultat ? (VALIDATED / BLOCKED / PARTIAL)" → store as {result}

If {result} is BLOCKED:
  Ask: "Type d'erreur ? (terminology_gap / prerequisite_gap / context_mismatch / outdated_knowledge / lazy_claim / overconfidence)"
  → store as {reason}
  Execute:
  ```bash
  node {project-root}/bin/byan-v2-cli.js elo record {domain} BLOCKED {reason}
  ```
Else:
  Execute:
  ```bash
  node {project-root}/bin/byan-v2-cli.js elo record {domain} {result}
  ```

Display the output (new rating + message).
Return to STEP 2.

---

### Choice 3 — Declare expertise

Ask: "Pour quel domaine ?" → store as {domain}

Ask: "Niveau ? (beginner / intermediate / advanced / expert / principal)"
→ store as {level}

Execute:
```bash
node {project-root}/bin/byan-v2-cli.js elo declare {domain} {level}
```

Display confirmation. Return to STEP 2.

---

### Choice 4 — LLM model recommendation

Execute:
```bash
node {project-root}/bin/byan-v2-cli.js elo summary
```

Extract and display only the "Recommended model" line with explanation:
```
Modele recommande pour cette session : {model} ({label})
Raison : {reason}

Note : ce modele est déterminé par ton ELO max actif.
Expert (601+) → haiku (réponses concises)
Praticien (201-600) → sonnet (équilibre)
Apprenti (0-200) → opus (raisonnement maximal)
```

Return to STEP 2.

---

### Choice 5 — Return

Exit workflow and return to BYAN main menu.

---

## ELO CLAIM CHALLENGE PROTOCOL

When BYAN is evaluating any user claim during a conversation (outside of this menu),
it follows this automatic protocol:

1. Identify the domain of the claim (javascript, security, algorithms, etc.)
2. Execute:
   ```bash
   node {project-root}/bin/byan-v2-cli.js elo context <domain>
   ```
3. Read `promptInstructions` from the JSON output
4. Apply those instructions when formulating the challenge response
5. After user acknowledges the result, record it:
   ```bash
   node {project-root}/bin/byan-v2-cli.js elo record <domain> <result> [reason]
   ```

This protocol runs silently — the user only sees the challenge response, not the ELO mechanics.
