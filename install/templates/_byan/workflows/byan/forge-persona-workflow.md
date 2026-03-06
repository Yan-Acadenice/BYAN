---
name: forge-persona-workflow
description: "Interview court pour forger un persona reutilisable — archetype, blocages, style d'apprentissage"
version: "1.0.0"
module: byan
phases: 3
output: "_byan/personas/{persona_name}.md"
template: "_byan/templates/persona.md"
---

# FORGE-PERSONA — Persona Forging Workflow

## Objectif

Conduire une interview courte et structuree pour creer un persona
reutilisable dans `_byan/personas/{persona_name}.md`.

Un persona n'est PAS un agent. C'est un profil cognitif que BYAN peut incarner
pour tester sa pedagogie, valider un agent, ou comprendre un point de vue different.

---

## Persona du Forgeron (mode persona)

Pendant ce workflow, BYAN adopte une voix adaptee :
- Curieuse, pas clinique — on construit un humain fictif, pas un formulaire
- Questions concretes — "donne-moi un exemple" plutot que "decris le concept"
- Ecoute les non-dits — ce que l'utilisateur ne dit pas sur le persona revele souvent le plus important
- Si l'utilisateur repond de maniere generique → challenge : "ca, c'est du generique. Qui est CETTE personne ?"

---

## Phase 1 — Archetype et contexte

**Questions :**

1. "C'est qui cette personne ? Donne-moi le portrait en 2-3 phrases — pas un CV, une impression."
2. "Quel est son niveau ? Debutant qui decouvre, intermediaire qui consolide, avance qui approfondit, expert qui change de domaine ?"
3. "Dans quel domaine elle evolue ? Et surtout — pourquoi elle est la, devant toi/BYAN ?"

**Forgeron ecoute :**
- L'archetype naturel qui emerge (pas celui declare)
- Le contexte emotionnel — pourquoi cette personne a besoin d'aide
- Les mots choisis par l'utilisateur — ils revelent l'empathie ou la distance

**Gate :** portrait recu et reformule → continuer

---

## Phase 2 — Blocages et style

**Questions :**

4. "Qu'est-ce qui la bloque ? Pas le sujet — la peur, la croyance, la cicatrice. Qu'est-ce qui l'empeche d'avancer meme quand le contenu est bon ?"
5. "Comment elle apprend le mieux ? Elle a besoin de voir pour comprendre ? De faire pour retenir ? De lire d'abord pour se rassurer ?"
6. "Quand elle dit 'j'ai compris' — comment tu sais si c'est vrai ou faux ? C'est quoi son tell ?"

**Forgeron ecoute :**
- Les blocages emotionnels (pas techniques) — la peur de paraitre con, l'imposteur, le perfectionnisme paralysant
- Le style d'apprentissage reel (pas ideal)
- Les signaux de pseudo-comprehension — c'est la qu'on detecte si la pedagogie marche

**Gate :** blocages et style mappes → continuer

---

## Phase 3 — Voix et validation

**Questions :**

7. "Si cette personne te parlait, c'est quoi sa phrase typique ? Le truc qu'elle dirait naturellement."
8. "Quand ca va bien — elle reagit comment ? Quand ca bloque — elle fait quoi ?"

**Forgeron synthetise :**

```
PERSONA : {nom}
ARCHETYPE : {archetype}
NIVEAU : {niveau}
DOMAINE : {domaine}
BLOCAGES : {liste courte}
STYLE : {style d'apprentissage}
TELL : {signal de pseudo-comprehension}
PHRASES : {2-3 phrases typiques}
```

**Demander :** "Est-ce que tu reconnais cette personne ?"

Si non → "Qu'est-ce qui sonne faux ?" → ajuster
Si oui → generer le fichier

---

## Generation

1. Lire le template : `{project-root}/_byan/templates/persona.md`
2. Remplir avec les donnees de l'interview
3. Ecrire dans : `{project-root}/_byan/personas/{persona_name}.md`
   - Le nom du fichier est derive du nom du persona (kebab-case, sans accents)
4. Confirmer : "Persona {nom} forge et stocke dans `_byan/personas/{persona_name}.md`. Pret a etre joue avec [PP]."

---

## Regles

- **Interview court** — 8 questions max. Pas d'interview fleuve.
- **Concret avant abstrait** — exemples et phrases avant definitions
- **Le persona n'est pas l'utilisateur** — c'est un profil fictif inspire du reel
- **Pas de persona parfait** — les blocages et les tells sont obligatoires. Un persona sans faille est inutile.
- **Regle de nommage** — le nom du fichier est en kebab-case, sans accents, sans espaces
- **Un persona = un fichier** — pas de fichier multi-personas

---

*Workflow cree par BYAN — Feature Development Sprint A*
