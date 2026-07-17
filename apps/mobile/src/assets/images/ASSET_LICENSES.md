# Mock image asset notes

## Scope

These files are local mock assets for the profile, analysis, look, and product preview UI:

- `profile-seojin-avatar.png`
- `report-bare-face-20260622.png`
- `report-retake-20260608.png`
- `style-oji-girl.png`
- `style-mori-girl.png`
- `style-clean-smoky.png`
- `product-coral-tint.png`
- `product-glow-cushion.png`
- `product-mood-cheek.png`
- `makeup-filters/filter-*.png`

## Source and production notes

- The portrait and product base images were provided by the project user as ChatGPT-generated mock images, not as real-person photography.
- The profile, report, and makeup-style preview assets were cropped, resized, and locally processed for the mobile mock UI.
- No external stock-photo URLs, Unsplash assets, real brand logos, or real product marks are used.
- Mock brand names in the profile data are fictional and should not be treated as real endorsements or affiliations.

## Commercial-use checklist

- OpenAI Terms of Use assign OpenAI's right, title, and interest in generated Output to the user to the extent permitted by law, but the user remains responsible for having the rights, licenses, and permissions for any Input.
- Current portrait assets are treated as AI-generated mock assets. If the team later replaces them with real-person photography or real-person likenesses, obtain consent/model-release approval before commercial production use.
- The `makeup-filters/filter-*.png` thumbnails were generated as fictional-model mock assets for the recommended AR filter demo. They do not intentionally depict real people, celebrities, influencers, brands, logos, SNS handles, or watermarks.
- Consulting expert and hero images are stored outside the repository in S3 and served through CloudFront.
- No attribution is required for these local mock assets.
- Before app-store release, replace or explicitly approve these mock assets through the team's final design/legal review process.

## Makeup recommendation situation cards (2026-07-16)

The following 768 x 768 WebP assets were generated specifically for the app with OpenAI's image-generation tool, then resized and compressed locally. They are not stock photos and do not intentionally depict real people, public figures, brands, products, logos, or readable signage:

- `makeup-recommendation/situations/daily.webp` — late-20s Seoul daily get-ready moment, butter yellow and silver styling.
- `makeup-recommendation/situations/work.webp` — early-30s creative-office presentation preparation, cobalt and charcoal styling.
- `makeup-recommendation/situations/date.webp` — late-20s rooftop-date arrival at blue hour, cherry and espresso styling.
- `makeup-recommendation/situations/social.webp` — late-20s/early-30s friends at a listening bar, plum and electric-blue direct-flash styling.
- `makeup-recommendation/situations/formal-event.webp` — early-30s contemporary wedding guest in a design hotel, dusty rose and navy styling.
- `makeup-recommendation/situations/travel-outdoor.webp` — late-20s coastal travel and sunscreen moment, sky-blue and terracotta styling.
- `makeup-recommendation/situations/camera-content.webp` — late-20s creator in a compact studio, lilac and cool-blue lighting.
- `makeup-recommendation/situations/festival-performance.webp` — late-20s friends applying a chrome eye accent before a festival, indigo and silver styling.

Shared prompt direction: a cohesive 2026 Seoul K-beauty/fashion editorial campaign for users in their 20s and 30s, candid motion, situation-specific lighting and color, clear mobile-thumbnail storytelling, and a calm lower area for an in-app text overlay. Every prompt explicitly excluded embedded text, watermarks, logos, branded packaging, readable screens, and generic stock-photo composition. When regenerated source PNGs are staged beside the assets as `<name>-source.png`, `scripts/mobile/optimize-makeup-situation-images.py` reproducibly builds and validates the checked-in WebP files. Large source PNGs are intentionally not committed.
### Situation-image provenance ledger

- Generation date: 2026-07-16.
- Generator: OpenAI image-generation tool exposed in Codex. The tool response did not expose a stable underlying model revision or random seed, so no unverified model identifier is recorded.
- Inputs/rights: text-only synthetic generation; no stock image, real-person photo, celebrity likeness, brand asset, or third-party reference image was supplied.
- Retained prompt brief: the shared direction above plus the per-file scene description in this section. The provider may internally expand prompts; that hidden expansion is not available for archival.
- Post-processing: converted to RGB, resized to 768×768 with Lanczos, encoded as WebP at the first quality in 84→68 that met 150 KiB, and stripped of EXIF by `scripts/mobile/optimize-makeup-situation-images.py`.
- Technical QA: all eight checked-in files pass RIFF/WEBP, lossy RGB/no-alpha, 768×768, and ≤150 KiB checks in `npm run test:makeup-recommendation`; no embedded text, logo, watermark, or branded packaging was intentionally retained.
- Review status: technical and product-direction QA complete; final app-store brand/legal approval remains a release gate.