# Plan de Resolution -- Delivrabilite Email com-advisor.com

**Client** : com-advisor.com
**Probleme** : IP dediee Brevo bloquee par Microsoft tous les ~3 mois
**Usage** : Prospection cold email
**Date d'audit** : 2026-03-03

---

## 1. Diagnostic

### 1.1 Symptome

L'IP dediee Brevo du client est bloquee par Microsoft (Outlook, Hotmail, Office 365) de facon cyclique, environ tous les 3 mois. Le client doit contacter le support Microsoft a chaque fois pour debloquer l'IP via le portail https://sender.office.com/.

### 1.2 Causes identifiees

| Cause | Severite | Detail |
|-------|----------|--------|
| Cold email via Brevo | Critique | Brevo est concu pour l'email marketing opt-in, pas la prospection a froid |
| DMARC a `p=none` | Elevee | Aucune protection anti-spoofing, Microsoft penalise |
| SPF incomplet | Moyenne | Google Workspace absent du SPF, softfail au lieu de hardfail |
| DKIM Google absent | Moyenne | Pas de signature DKIM pour les mails envoyes via Google Workspace |
| Rapports DMARC non recus | Faible | Les rapports vont chez Brevo, pas chez le client |

### 1.3 Etat actuel des enregistrements DNS

**Hebergeur DNS** : OVH (`ns112.ovh.net`)
**MX** : Google Workspace (`aspmx.l.google.com`)

#### SPF actuel

```
v=spf1 include:spf.sendinblue.com mx ~all
```

**Problemes** :
- `include:_spf.google.com` manquant (Google Workspace non autorise explicitement)
- `~all` (softfail) au lieu de `-all` (hardfail)
- `mx` est une couverture partielle, pas suffisante pour Google

#### DKIM actuel

```
mail._domainkey.com-advisor.com -> Cle RSA Brevo presente (OK)
google._domainkey.com-advisor.com -> ABSENT
```

#### DMARC actuel

```
v=DMARC1; p=none; sp=none; rua=mailto:dmarc@mailinblue.com!10m; ruf=mailto:dmarc@mailinblue.com!10m; rf=afrf; pct=100; ri=86400
```

**Problemes** :
- `p=none` = aucune action sur les mails frauduleux
- Rapports envoyes a `dmarc@mailinblue.com` (Brevo), pas au client
- Configuration jamais mise a jour depuis l'epoque Sendinblue

---

## 2. Actions correctives DNS

### 2.1 Corriger le SPF

**Ou** : OVH > Zone DNS > com-advisor.com > Enregistrement TXT racine

**Ancien** :
```
v=spf1 include:spf.sendinblue.com mx ~all
```

**Nouveau** :
```
v=spf1 include:_spf.google.com include:spf.sendinblue.com -all
```

**Changements** :
1. Ajout de `include:_spf.google.com` pour autoriser les serveurs Google Workspace
2. Suppression de `mx` (redondant avec l'include Google)
3. Passage de `~all` a `-all` (hardfail = rejet strict des serveurs non autorises)

### 2.2 Configurer DKIM Google

**Etape 1** -- Generer la cle DKIM dans Google Workspace :
1. Aller dans https://admin.google.com
2. Menu > Applications > Google Workspace > Gmail
3. Authentifier les e-mails
4. Selectionner le domaine `com-advisor.com`
5. Cliquer "Generer un nouvel enregistrement"
6. Longueur de cle : **2048 bits** (recommande)
7. Prefixe du selecteur : `google` (par defaut)
8. Copier l'enregistrement TXT genere

**Etape 2** -- Ajouter dans OVH :
- Type : TXT
- Sous-domaine : `google._domainkey`
- Valeur : la cle copiee depuis Google Admin

**Etape 3** -- Activer dans Google Workspace :
- Retourner dans Google Admin > Gmail > Authentification
- Cliquer "Demarrer l'authentification"

**Delai de propagation** : 24-48h

### 2.3 Corriger le DMARC

**Ou** : OVH > Zone DNS > Enregistrement TXT `_dmarc`

**Ancien** :
```
v=DMARC1; p=none; sp=none; rua=mailto:dmarc@mailinblue.com!10m; ruf=mailto:dmarc@mailinblue.com!10m; rf=afrf; pct=100; ri=86400
```

**Phase 1 -- Quarantaine (a appliquer maintenant)** :
```
v=DMARC1; p=quarantine; sp=quarantine; pct=100; rua=mailto:EMAIL_CLIENT@com-advisor.com,mailto:dmarc@mailinblue.com; ruf=mailto:EMAIL_CLIENT@com-advisor.com; fo=1; ri=86400
```

**Phase 2 -- Reject (apres 4-6 semaines sans probleme)** :
```
v=DMARC1; p=reject; sp=reject; pct=100; rua=mailto:EMAIL_CLIENT@com-advisor.com,mailto:dmarc@mailinblue.com; ruf=mailto:EMAIL_CLIENT@com-advisor.com; fo=1; ri=86400
```

**Changements** :
1. `p=quarantine` puis `p=reject` au lieu de `p=none`
2. Ajout de l'email du client dans `rua=` (rapports agreges) et `ruf=` (rapports forensiques)
3. Conservation de `dmarc@mailinblue.com` en copie pour que Brevo continue son monitoring
4. Ajout de `fo=1` pour recevoir un rapport a chaque echec

> **Important** : Remplacer `EMAIL_CLIENT@com-advisor.com` par l'adresse reelle du client ou une boite dediee type `dmarc-reports@com-advisor.com`.

### 2.4 Nettoyer les anciens enregistrements

**Optionnel mais recommande** :
- L'enregistrement `Sendinblue-code:8f45ceba710eadc79d9d19d65bccb33c` peut rester (verification du domaine Brevo). Il ne pose pas de probleme technique.

---

## 3. Strategie Cold Email

### 3.1 Le probleme fondamental

Brevo n'est **pas concu** pour le cold email. C'est un outil d'email marketing (newsletters, transactionnel, automation) qui suppose que les destinataires ont donne leur consentement (opt-in).

La prospection a froid genere par nature :
- Des taux d'ouverture faibles (10-25% vs 40-60% en marketing)
- Des plaintes spam (les gens signalent ce qu'ils n'ont pas demande)
- Des bounces (listes non verifiees)
- Un engagement minimal

Microsoft detecte ces patterns et bloque l'IP.

### 3.2 Option A -- Migrer le cold email vers un outil dedie (recommande)

**Outils specialises cold email** :

| Outil | Prix approx. | Points forts |
|-------|-------------|--------------|
| **Lemlist** | 59 EUR/mois | Leader francais, warm-up integre, sequences multi-canal |
| **Instantly** | 30 $/mois | Rotation d'emails illimitee, warm-up automatique |
| **Smartlead** | 39 $/mois | Multi-boites mail, warm-up, AI |
| **Woodpecker** | 29 $/mois | Focus B2B, detection de reponses, conditions |

**Pourquoi ca resout le probleme** :
1. Envoi via le SMTP du client (Gmail/Outlook individuel), pas via une IP dediee
2. Warm-up automatique qui maintient la reputation
3. Rotation entre plusieurs boites mail et domaines
4. Limites d'envoi intelligentes (30-50/jour/boite max)
5. Detection automatique des bounces et desabonnements

**Architecture recommandee** :
```
Cold email     -> Outil dedie (Lemlist/Instantly)
                  -> SMTP Gmail du client
                  -> Rotation multi-boites

Marketing      -> Brevo (IP dediee)
                  -> Newsletters opt-in
                  -> Emails transactionnels
                  -> Automation marketing
```

### 3.3 Option B -- Garder Brevo mais adapter les pratiques

Si le client refuse de changer d'outil, ces mesures **reduiront** la frequence des blocages sans les eliminer :

1. **Reduire les volumes** : max 50-100 cold emails/jour via l'IP dediee
2. **Nettoyer les listes** avant chaque campagne (utiliser NeverBounce, ZeroBounce, ou Dropcontact)
3. **Segmenter** : ne jamais envoyer cold + marketing sur la meme IP
4. **Supprimer** les contacts sans ouverture apres 2 relances
5. **Surveiller SNDS** : https://sendersupport.olc.protection.outlook.com/snds/
6. **S'inscrire au JMRP** (Junk Mail Reporting Program) de Microsoft pour etre alerte en cas de plaintes

### 3.4 Option C -- Setup multi-domaines (avance)

Pour les gros volumes de prospection, utiliser des domaines secondaires :

1. Acheter 2-3 domaines proches (`com-advisor.fr`, `comadvisor.com`, etc.)
2. Configurer SPF + DKIM + DMARC sur chaque domaine
3. Creer des boites Gmail/Outlook sur chaque domaine
4. Faire tourner les envois entre les domaines
5. Si un domaine est bloque, les autres continuent

> **Attention** : Cette pratique est a la limite des bonnes pratiques et peut etre vue comme du contournement par les FAI.

---

## 4. Plan d'action chronologique

### Semaine 1 -- DNS (immediat)

- [ ] Corriger le SPF (ajouter Google, passer en -all)
- [ ] Configurer DKIM Google dans Google Workspace Admin
- [ ] Passer DMARC a `p=quarantine`
- [ ] Ajouter l'email du client dans les rapports DMARC
- [ ] Verifier la propagation DNS apres 24-48h avec https://mxtoolbox.com

### Semaine 2 -- Monitoring

- [ ] S'inscrire a Microsoft SNDS : https://sendersupport.olc.protection.outlook.com/snds/
- [ ] S'inscrire au JMRP Microsoft
- [ ] Verifier les rapports DMARC recus par le client
- [ ] Tester la delivrabilite avec https://mail-tester.com (viser un score 9+/10)

### Semaine 3-4 -- Strategie cold email

- [ ] Choisir un outil dedie cold email (Lemlist ou Instantly recommande)
- [ ] Configurer les boites mail du client dans l'outil
- [ ] Lancer le warm-up automatique (2-4 semaines)
- [ ] Migrer progressivement les campagnes cold de Brevo vers l'outil dedie

### Semaine 6 -- DMARC phase 2

- [ ] Si aucun probleme en quarantaine, passer DMARC a `p=reject`
- [ ] Verifier que tous les flux email legitimes passent toujours

### Mois 2-3 -- Suivi

- [ ] Verifier que l'IP Brevo n'est plus bloquee (elle ne sert plus pour le cold)
- [ ] Surveiller les metriques SNDS et les rapports DMARC
- [ ] Ajuster les volumes si necessaire

---

## 5. Verification post-correction

### Outils de test

| Outil | URL | Ce qu'il verifie |
|-------|-----|------------------|
| MXToolbox | https://mxtoolbox.com/SuperTool.aspx | SPF, DKIM, DMARC, blacklists |
| Mail-Tester | https://mail-tester.com | Score delivrabilite global |
| Google Admin Toolbox | https://toolbox.googleapps.com/apps/checkmx/ | Config MX et authentification |
| Microsoft SNDS | https://sendersupport.olc.protection.outlook.com/snds/ | Reputation IP chez Microsoft |
| DMARC Analyzer | https://www.dmarcanalyzer.com/dmarc/dmarc-record-check/ | Validation enregistrement DMARC |

### Commandes dig pour verification

```bash
# Verifier SPF
dig com-advisor.com TXT +short | grep spf

# Verifier DKIM Brevo
dig mail._domainkey.com-advisor.com TXT +short

# Verifier DKIM Google (apres configuration)
dig google._domainkey.com-advisor.com TXT +short

# Verifier DMARC
dig _dmarc.com-advisor.com TXT +short

# Verifier MX
dig com-advisor.com MX +short
```

### Resultats attendus apres correction

```
SPF  : v=spf1 include:_spf.google.com include:spf.sendinblue.com -all
DKIM : mail._domainkey -> cle RSA Brevo (existante)
       google._domainkey -> cle RSA Google (a creer)
DMARC: v=DMARC1; p=quarantine; ... (phase 1)
       v=DMARC1; p=reject; ... (phase 2)
```

---

## 6. Sources et references

1. **Brevo -- Introduction IP dediee**
   https://help.brevo.com/hc/en-us/articles/208835449-Introduction-to-dedicated-IPs

2. **Brevo -- Bonnes pratiques IP dediee**
   https://help.brevo.com/hc/fr/articles/209576665-Bonnes-pratiques-pour-gérer-une-IP-dédiée

3. **Brevo -- Pourquoi mon IP est blocklistee**
   https://help.brevo.com/hc/fr/articles/8847188389650-FAQ-Pourquoi-mon-adresse-IP-ou-mon-domaine-est-il-blocklisté

4. **Brevo -- Chauffe automatique IP dediee**
   https://help.brevo.com/hc/fr/articles/33359225915154-Chauffer-votre-IP-dédiée-chauffe-automatique

5. **Microsoft -- Portail de deblocage IP**
   https://sender.office.com/

6. **Microsoft Q&A -- Deblocage IP Brevo**
   https://learn.microsoft.com/en-us/answers/questions/5663116/d-blocage-ip-pour-emailing-brevo

7. **Microsoft SNDS -- Monitoring reputation**
   https://sendersupport.olc.protection.outlook.com/snds/

8. **Mailtrap -- Guide SNDS**
   https://mailtrap.io/blog/microsoft-snds/

9. **HackRepair -- Guide delist Microsoft blocklist**
   https://hackrepair.com/email-security/delist-a-blocked-ip-from-office-365-step-by-step-recovery-and-prevention-guide-2025

10. **Suped -- Resoudre les problemes de reputation IP Microsoft**
    https://www.suped.com/knowledge/email-deliverability/sender-reputation/how-to-resolve-persistent-ip-reputation-issues-with-microsoft-despite-ip-warmups-and-clean-lists

---

*Document genere le 2026-03-03 -- Audit DNS et recommandations delivrabilite pour com-advisor.com*
