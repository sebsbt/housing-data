# MIRROR.md

## Repository routing

- **Primary repo (work/push):** `https://github.com/sebsbt/housing-data.git`
- **Mirror target:** `https://github.com/sebastianSbg/housing-data.git`

## Local remotes

- `origin` -> primary (`sebsbt/housing-data`)
- `mirror` -> mirror target (`sebastianSbg/housing-data`)

## Push workflow

1. Push normal updates to primary:
   ```bash
   git push origin main
   ```
2. Mirror sync (all refs):
   ```bash
   git push --mirror mirror
   ```

## Notes

- Keep credentials out of remote URLs where possible.
- If mirror push fails due auth, update credentials and rerun mirror push.
