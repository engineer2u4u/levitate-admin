# Certificate plates

Drop the two finished certificate designs here, named exactly:

| File | Format | Size |
|---|---|---|
| `shrm.png` | SHRM Certificate of Completion | 1536 x 1024 |
| `excellence.png` | Award of Excellence | 1600 x 900 |

The Certificates screen picks them up on load — no upload, no configuration.
A file that is not here is simply not used, and the drawn layout stands in.

JPEG works too, but the filename must still end `.png`, or change the paths in
`LOCAL_PLATES` (`src/lib/certificate.ts`).

## If the artwork still has its specimen text

"[Name of Recipient]", "Your Name Here", the sample dates and the sample
certificate ID. Tick **My plates still have the specimen text on them** under
Branding & signatures, and each of those areas is covered before the real value
is written over it. The colour of each patch is read from the plate itself, so
it works over the blue panel as well as over white.

Cleaner artwork is still better: a patch is a flat rectangle, and the panel
behind the certificate ID is a gradient, so a large patch there can show a
faint seam. Erasing the specimen text once avoids that for good.
