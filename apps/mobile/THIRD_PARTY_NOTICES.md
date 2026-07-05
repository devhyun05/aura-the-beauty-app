# Third Party Notices

This mobile app includes the following third-party resources.

## Pretendard

- Source: https://github.com/orioncactus/pretendard
- License: SIL Open Font License 1.1
- Copyright: Copyright (c) 2021, Kil Hyung-jin and contributors.
- Usage: Bundled font files are used for the mobile app UI.

Notes:

- Commercial app use and bundling are allowed under the SIL Open Font License 1.1.
- The font software must not be sold by itself.
- Modified font versions must follow the Reserved Font Name rules in the license.

## Lucide Icons

- Source: https://github.com/lucide-icons/lucide
- Package: lucide-react-native
- License: ISC
- Copyright: Copyright (c) Lucide Icons and contributors.
- Usage: Camera capture screen icons.

Notes:

- Commercial app use is allowed under the ISC license.
- Some Lucide icons are derived from Feather Icons and retain the Feather MIT license notice.

## Feather Icons

- Source: https://github.com/feathericons/feather
- License: MIT
- Copyright: Copyright (c) 2013-present Cole Bemis.
- Usage: Upstream attribution for Lucide icons derived from Feather Icons.

Notes:

- Commercial app use is allowed under the MIT license.
- Keep the copyright and permission notice with distributions that include derived icons.

## otdnnc/virtual-makeup

- Source: https://github.com/otdnnc/virtual-makeup
- License: MIT, as declared by the upstream README.
- Reference paths: `apps/web/src/lib/makeup/landmarks.ts`, `apps/web/src/lib/makeup/face.ts`.
- Usage: Reference implementation consulted for the generated eyebrow mask approach.

Notes:

- No upstream source file is vendored in this app.
- The referenced eyebrow flow uses MediaPipe face landmarks, polygon mask fill, blur, and weighted color compositing.
- This app adapts that approach into the existing React Native + Unity generated brow mask path instead of using the web canvas implementation directly.
