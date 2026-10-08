---
change_id: landing-page
title: Landing page
status: impl_reviewed
created: 2026-10-08
updated: 2026-10-08
archived_at: null
---

## Notes

**Archive gate (owner decision, 2026-10-08):** do not run `/10x-archive landing-page` until the owner confirms every Google submission, after the new landing page and the privacy policy are live on production (details: `frame.md`, "Bramka przed `/10x-archive`"):

- [ ] New `/` and the privacy policy (plus any other page Google requires) live on production, policy linked from the home page
- [ ] Search Console: "Request review" sent for the "Deceptive pages" issue, after that deploy
- [ ] Google Auth Platform → Branding: home page and privacy policy URLs entered, `streakboard.app` in authorized domains
- [ ] Review passed: Search Console shows no issue, Transparency Report shows no flag; result noted in `context/changes/deployment/deployment-plan.md`
