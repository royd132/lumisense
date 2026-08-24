# Public data used by LumiSense

## Sephora Product Reviews sample

- Source: [Sephora Product Reviews on Kaggle](https://www.kaggle.com/datasets/zeeenb/sephora-product-reviews)
- Dataset license: CC0-1.0
- Retrieved: 2026-08-24
- Upstream file: `sephora/P439926.json`
- Upstream file SHA-256: `53DF9DC67951C37DACD411BF695DBFE3F28C9933B868BB850039E3E277E0E321`

The repository contains only three review excerpts selected from 1,232 public records in that product file. Selection requires a rating of one star and explicit adverse skin-reaction language. User nicknames, author IDs, email fields, photos, locations, badges and social metadata are not retained.

The records are used only for a reproducible competition demonstration:

1. ingest public experience;
2. detect a baseline English safety-signal miss;
3. extract a reusable bilingual safety Skill candidate;
4. compare the candidate with the existing SkillBank;
5. merge into a versioned candidate;
6. run shadow evaluation and the existing regression suite;
7. require human promotion before activation.

The reviews are not customer-service conversations. Any multi-turn service scenario derived from them is explicitly labelled as a synthetic reconstruction and is not represented as an original consumer dialogue.
