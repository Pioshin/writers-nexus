# P0 Closure Checklist — Writer's Nexus

Data: 12 febbraio 2026  
Versione: v0.1.0-alpha  
Scope: chiusura P0 (Giorni 1–5)

## Stato tecnico già verificato

- [x] Sicurezza API key Google: uso header, niente query string
- [x] Validazione import testo: whitelist estensioni + limite dimensione
- [x] Stabilità modali: init idempotente su modali core e secondari
- [x] Undo batch reorder struttura implementato
- [x] Lint mirato P0 senza errori
- [x] Endpoint runtime core su porta 55099 in `200 OK`

---

## Pre-condizioni test E2E

- [x] App avviata su `http://127.0.0.1:55099`
- [x] Browser pulito (nessun modal aperto da run precedenti)
- [x] Un file `.txt` o `.md` <= 5MB disponibile per import
- [x] Un file NON valido (es. `.pdf`) disponibile per test negativo
- [x] Un file > 5MB disponibile per test negativo size

---

## Smoke E2E — Run 1

### A) Progetto
- [X] Apri Dashboard
- [x] Crea nuovo progetto
- [x] Verifica progetto attivo in sidebar

### B) Import testo (positivo)
- [x] Apri modale Importa Testo
- [x] Carica file valido (`.txt/.md` <= 5MB)
- [ ] Esegui parsing
- [ ] Commit import
- [ ] Verifica scene/idee create

### C) Import testo (negativi)
- [ ] Prova file estensione non supportata -> errore user-friendly
- [ ] Prova file > 5MB -> errore user-friendly

### D) Struttura + Undo
- [ ] Vai in Struttura
- [ ] Trascina una scena in nuova posizione (stesso stage)
- [ ] Esegui undo (`Ctrl+Alt+Z`)
- [ ] Verifica ripristino ordine corretto

### E) Scrittura
- [ ] Vai in Scrittura
- [ ] Apri una scena
- [ ] Modifica contenuto e verifica salvataggio

### F) Backup
- [ ] Esporta progetto JSON
- [ ] Importa il backup appena esportato
- [ ] Verifica integrità dati (scene presenti, progetto corretto)

Esito Run 1:
- [ ] PASS
- [ ] FAIL
- Note:

---

## Smoke E2E — Run 2

Ripetere la stessa sequenza A→F.

Esito Run 2:
- [ ] PASS
- [ ] FAIL
- Note:

---

## Smoke E2E — Run 3

Ripetere la stessa sequenza A→F.

Esito Run 3:
- [ ] PASS
- [ ] FAIL
- Note:

---

## Criteri di chiusura P0

P0 può essere chiuso se TUTTI veri:
- [ ] Run 1 PASS
- [ ] Run 2 PASS
- [ ] Run 3 PASS
- [ ] Nessun bug bloccante aperto nei flussi core
- [ ] Nessuna regressione su import/struttura/scrittura/backup

---

## Sign-off

- QA/Tester: ____________________  Data: __________
- Dev: __________________________  Data: __________
- Decisione finale:
  - [ ] P0 CHIUSO
  - [ ] P0 NON CHIUSO (aprire mini-ciclo 3–5 giorni)
