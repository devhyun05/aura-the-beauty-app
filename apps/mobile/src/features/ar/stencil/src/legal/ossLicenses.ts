/**
 * 오픈소스 라이선스 고지 데이터 — 앱 내 "오픈소스 라이선스" 화면용.
 *
 * 자동 생성물(손으로 편집하지 말 것). 리포 루트에서
 *   npx license-checker --production --json
 * 스냅샷(2026-07-13)으로 프로덕션 의존성 539종을 수집했다(루트 앱
 * 패키지 제외). RN은 md/txt를 직접 로드할 수 없어 문자열 상수로 번들한다.
 *
 * 대표 라이선스 전문은 SPDX 타입별 1회만 싣는다(MIT/Apache-2.0/ISC/BSD).
 * MediaPipe·Unity 플러그인 고지는 NOTICE.md 를 정본으로 하며 여기 요약을 둔다.
 */

export interface OssPackage {
  /** 패키지명(버전 포함) */
  name: string;
  /** SPDX 라이선스 식별자 */
  license: string;
  /** 저작권자/게시자 */
  publisher?: string;
  /** 저장소 URL */
  repository?: string;
}

export interface LicenseText {
  /** SPDX 식별자 */
  id: string;
  /** 표시 제목 */
  title: string;
  /** 라이선스 전문(대표) */
  text: string;
}

export interface LicenseHistogramRow {
  id: string;
  count: number;
}

/** SPDX 타입별 패키지 수(요약 표시용, 많은 순). */
export const OSS_LICENSE_HISTOGRAM: LicenseHistogramRow[] = [
  {
    "id": "MIT",
    "count": 456
  },
  {
    "id": "ISC",
    "count": 37
  },
  {
    "id": "BSD-3-Clause",
    "count": 19
  },
  {
    "id": "Apache-2.0",
    "count": 11
  },
  {
    "id": "BSD-2-Clause",
    "count": 10
  },
  {
    "id": "Python-2.0",
    "count": 1
  },
  {
    "id": "CC-BY-4.0",
    "count": 1
  },
  {
    "id": "(MIT OR Apache-2.0)",
    "count": 1
  },
  {
    "id": "0BSD",
    "count": 1
  },
  {
    "id": "CC0-1.0",
    "count": 1
  },
  {
    "id": "(MIT OR CC0-1.0)",
    "count": 1
  }
];

/** MediaPipe·Unity 프레임워크 번들 고지(요약). NOTICE.md 정본. */
export const BUNDLED_NOTICES = `## Google MediaPipe (ML 모델·프레임워크)

- face_landmarker.task — 얼굴 랜드마크 모델(468점)
- selfie_multiclass_256x256.tflite — 셀피 세그멘테이션 모델
- canonical_face_model.obj — 캐노니컬 페이스 메시

출처: Google MediaPipe (https://github.com/google-ai-edge/mediapipe)
라이선스: Apache License 2.0
Copyright 2019-2025 The MediaPipe Authors.

## MediaPipe Unity Plugin

출처: https://github.com/homuler/MediaPipeUnityPlugin (v0.16.3)
라이선스: MIT License, Copyright (c) 2021 homuler

## MediaPipeUnity.framework — 서드파티 컴포넌트

번들된 네이티브 프레임워크(MediaPipeUnity.framework)는 아래 오픈소스 컴포넌트를
포함합니다(Unity 패키지의 "Third Party Notices.md" 요약). 전문은 각 프로젝트
저장소에서 확인할 수 있습니다.

- Abseil — Apache 2.0
- Ceres Solver — BSD 계열(Custom)
- cpuinfo — BSD 2-Clause
- easyexif — BSD 2-Clause
- Emscripten — MIT
- FlatBuffers — Apache 2.0
- Font Awesome — SIL OFL 1.1
- gflags — BSD 3-Clause
- Google Logging Library (glog) — BSD 3-Clause
- KleidiAI — Apache 2.0
- libyuv — BSD 3-Clause
- MediaPipe — Apache 2.0
- Protocol Buffers — BSD 3-Clause
- RE2 — BSD 3-Clause
- SentencePiece — Apache 2.0
- Skia — BSD 3-Clause
- System.Buffers — MIT
- System.Memory — MIT
- System.Runtime.CompilerServices.Unsafe — MIT
- TensorFlow — Apache 2.0(Custom)
- TensorFlow Text — Apache 2.0(Custom)
- OpenCV — BSD 3-Clause
- Carotene — BSD 3-Clause
- libjpeg-turbo — IJG
- libpng — libpng License
- LibTIFF — libtiff License
- OpenEXR — BSD 3-Clause
- pthreadpool — BSD 2-Clause
- XNNPACK — BSD 3-Clause
- zlib — Zlib License`;

/** 대표 라이선스 전문 — SPDX 타입별 1회. */
export const LICENSE_TEXTS: LicenseText[] = [
  {
    id: "MIT",
    title: "MIT License",
    text: `MIT License

Copyright (c) <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
  },
  {
    id: "Apache-2.0",
    title: "Apache License 2.0",
    text: `Apache License

Version 2.0, January 2004

http://www.apache.org/licenses/ 

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction, and distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by the copyright owner that is granting the License.

"Legal Entity" shall mean the union of the acting entity and all other entities that control, are controlled by, or are under common control with that entity. For the purposes of this definition, "control" means (i) the power, direct or indirect, to cause the direction or management of such entity, whether by contract or otherwise, or (ii) ownership of fifty percent (50%) or more of the outstanding shares, or (iii) beneficial ownership of such entity.

"You" (or "Your") shall mean an individual or Legal Entity exercising permissions granted by this License.

"Source" form shall mean the preferred form for making modifications, including but not limited to software source code, documentation source, and configuration files.

"Object" form shall mean any form resulting from mechanical transformation or translation of a Source form, including but not limited to compiled object code, generated documentation, and conversions to other media types.

"Work" shall mean the work of authorship, whether in Source or Object form, made available under the License, as indicated by a copyright notice that is included in or attached to the work (an example is provided in the Appendix below).

"Derivative Works" shall mean any work, whether in Source or Object form, that is based on (or derived from) the Work and for which the editorial revisions, annotations, elaborations, or other modifications represent, as a whole, an original work of authorship. For the purposes of this License, Derivative Works shall not include works that remain separable from, or merely link (or bind by name) to the interfaces of, the Work and Derivative Works thereof.

"Contribution" shall mean any work of authorship, including the original version of the Work and any modifications or additions to that Work or Derivative Works thereof, that is intentionally submitted to Licensor for inclusion in the Work by the copyright owner or by an individual or Legal Entity authorized to submit on behalf of the copyright owner. For the purposes of this definition, "submitted" means any form of electronic, verbal, or written communication sent to the Licensor or its representatives, including but not limited to communication on electronic mailing lists, source code control systems, and issue tracking systems that are managed by, or on behalf of, the Licensor for the purpose of discussing and improving the Work, but excluding communication that is conspicuously marked or otherwise designated in writing by the copyright owner as "Not a Contribution."

"Contributor" shall mean Licensor and any individual or Legal Entity on behalf of whom a Contribution has been received by Licensor and subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare Derivative Works of, publicly display, publicly perform, sublicense, and distribute the Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable (except as stated in this section) patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer the Work, where such license applies only to those patent claims licensable by such Contributor that are necessarily infringed by their Contribution(s) alone or by combination of their Contribution(s) with the Work to which such Contribution(s) was submitted. If You institute patent litigation against any entity (including a cross-claim or counterclaim in a lawsuit) alleging that the Work or a Contribution incorporated within the Work constitutes direct or contributory patent infringement, then any patent licenses granted to You under this License for that Work shall terminate as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the Work or Derivative Works thereof in any medium, with or without modifications, and in Source or Object form, provided that You meet the following conditions:

You must give any other recipients of the Work or Derivative Works a copy of this License; and

You must cause any modified files to carry prominent notices stating that You changed the files; and

You must retain, in the Source form of any Derivative Works that You distribute, all copyright, patent, trademark, and attribution notices from the Source form of the Work, excluding those notices that do not pertain to any part of the Derivative Works; and

If the Work includes a "NOTICE" text file as part of its distribution, then any Derivative Works that You distribute must include a readable copy of the attribution notices contained within such NOTICE file, excluding those notices that do not pertain to any part of the Derivative Works, in at least one of the following places: within a NOTICE text file distributed as part of the Derivative Works; within the Source form or documentation, if provided along with the Derivative Works; or, within a display generated by the Derivative Works, if and wherever such third-party notices normally appear. The contents of the NOTICE file are for informational purposes only and do not modify the License. You may add Your own attribution notices within Derivative Works that You distribute, alongside or as an addendum to the NOTICE text from the Work, provided that such additional attribution notices cannot be construed as modifying the License. You may add Your own copyright statement to Your modifications and may provide additional or different license terms and conditions for use, reproduction, or distribution of Your modifications, or for any such Derivative Works as a whole, provided Your use, reproduction, and distribution of the Work otherwise complies with the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise, any Contribution intentionally submitted for inclusion in the Work by You to the Licensor shall be under the terms and conditions of this License, without any additional terms or conditions. Notwithstanding the above, nothing herein shall supersede or modify the terms of any separate license agreement you may have executed with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade names, trademarks, service marks, or product names of the Licensor, except as required for reasonable and customary use in describing the origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or agreed to in writing, Licensor provides the Work (and each Contributor provides its Contributions) on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied, including, without limitation, any warranties or conditions of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE. You are solely responsible for determining the appropriateness of using or redistributing the Work and assume any risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory, whether in tort (including negligence), contract, or otherwise, unless required by applicable law (such as deliberate and grossly negligent acts) or agreed to in writing, shall any Contributor be liable to You for damages, including any direct, indirect, special, incidental, or consequential damages of any character arising as a result of this License or out of the use or inability to use the Work (including but not limited to damages for loss of goodwill, work stoppage, computer failure or malfunction, or any and all other commercial damages or losses), even if such Contributor has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing the Work or Derivative Works thereof, You may choose to offer, and charge a fee for, acceptance of support, warranty, indemnity, or other liability obligations and/or rights consistent with this License. However, in accepting such obligations, You may act only on Your own behalf and on Your sole responsibility, not on behalf of any other Contributor, and only if You agree to indemnify, defend, and hold each Contributor harmless for any liability incurred by, or claims asserted against, such Contributor by reason of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS`,
  },
  {
    id: "ISC",
    title: "ISC License",
    text: `ISC License

Copyright (c) <year> <copyright holders>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`,
  },
  {
    id: "BSD-3-Clause",
    title: "BSD 3-Clause License",
    text: `BSD 3-Clause License

Copyright (c) <year>, <copyright holders>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,
  },
  {
    id: "BSD-2-Clause",
    title: "BSD 2-Clause License",
    text: `BSD 2-Clause License

Copyright (c) <year>, <copyright holders>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,
  },
];

/** license-checker --production 수집 목록(루트 앱 제외, 이름순). */
export const OSS_PACKAGES: OssPackage[] = [
  {
    "name": "@azesmway/react-native-unity@1.0.11",
    "license": "MIT",
    "publisher": "Alexey Zolotaryov",
    "repository": "https://github.com/azesmway/react-native-unity"
  },
  {
    "name": "@babel/code-frame@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/compat-data@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/core@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/generator@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-annotate-as-pure@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-compilation-targets@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-create-class-features-plugin@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-create-regexp-features-plugin@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-define-polyfill-provider@0.6.8",
    "license": "MIT",
    "repository": "https://github.com/babel/babel-polyfills"
  },
  {
    "name": "@babel/helper-globals@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-member-expression-to-functions@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-module-imports@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-module-transforms@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-optimise-call-expression@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-plugin-utils@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-remap-async-to-generator@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-replace-supers@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-skip-transparent-expression-wrappers@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-string-parser@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-validator-identifier@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-validator-option@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helper-wrap-function@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/helpers@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/parser@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-proposal-export-default-from@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-syntax-async-generators@7.8.4",
    "license": "MIT",
    "repository": "https://github.com/babel/babel/tree/master/packages/babel-plugin-syntax-async-generators"
  },
  {
    "name": "@babel/plugin-syntax-bigint@7.8.3",
    "license": "MIT",
    "repository": "https://github.com/babel/babel/tree/master/packages/babel-plugin-syntax-bigint"
  },
  {
    "name": "@babel/plugin-syntax-class-properties@7.12.13",
    "license": "MIT",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-syntax-class-static-block@7.14.5",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-syntax-dynamic-import@7.8.3",
    "license": "MIT",
    "repository": "https://github.com/babel/babel/tree/master/packages/babel-plugin-syntax-dynamic-import"
  },
  {
    "name": "@babel/plugin-syntax-export-default-from@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-syntax-flow@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-syntax-import-attributes@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-syntax-import-meta@7.10.4",
    "license": "MIT",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-syntax-json-strings@7.8.3",
    "license": "MIT",
    "repository": "https://github.com/babel/babel/tree/master/packages/babel-plugin-syntax-json-strings"
  },
  {
    "name": "@babel/plugin-syntax-jsx@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-syntax-logical-assignment-operators@7.10.4",
    "license": "MIT",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-syntax-nullish-coalescing-operator@7.8.3",
    "license": "MIT",
    "repository": "https://github.com/babel/babel/tree/master/packages/babel-plugin-syntax-nullish-coalescing-operator"
  },
  {
    "name": "@babel/plugin-syntax-numeric-separator@7.10.4",
    "license": "MIT",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-syntax-object-rest-spread@7.8.3",
    "license": "MIT",
    "repository": "https://github.com/babel/babel/tree/master/packages/babel-plugin-syntax-object-rest-spread"
  },
  {
    "name": "@babel/plugin-syntax-optional-catch-binding@7.8.3",
    "license": "MIT",
    "repository": "https://github.com/babel/babel/tree/master/packages/babel-plugin-syntax-optional-catch-binding"
  },
  {
    "name": "@babel/plugin-syntax-optional-chaining@7.8.3",
    "license": "MIT",
    "repository": "https://github.com/babel/babel/tree/master/packages/babel-plugin-syntax-optional-chaining"
  },
  {
    "name": "@babel/plugin-syntax-private-property-in-object@7.14.5",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-syntax-top-level-await@7.14.5",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-syntax-typescript@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-async-generator-functions@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-async-to-generator@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-block-scoping@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-class-properties@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-classes@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-destructuring@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-flow-strip-types@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-for-of@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-modules-commonjs@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-named-capturing-groups-regex@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-nullish-coalescing-operator@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-optional-catch-binding@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-optional-chaining@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-private-methods@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-private-property-in-object@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-react-display-name@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-react-jsx-self@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-react-jsx-source@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-react-jsx@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-regenerator@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-runtime@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-typescript@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/plugin-transform-unicode-regex@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/runtime@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/template@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/traverse@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@babel/types@7.29.7",
    "license": "MIT",
    "publisher": "The Babel Team",
    "repository": "https://github.com/babel/babel"
  },
  {
    "name": "@hapi/hoek@9.3.0",
    "license": "BSD-3-Clause",
    "repository": "https://github.com/hapijs/hoek"
  },
  {
    "name": "@hapi/topo@5.1.0",
    "license": "BSD-3-Clause",
    "repository": "https://github.com/hapijs/topo"
  },
  {
    "name": "@isaacs/ttlcache@1.4.1",
    "license": "ISC",
    "publisher": "Isaac Z. Schlueter",
    "repository": "https://github.com/isaacs/ttlcache"
  },
  {
    "name": "@istanbuljs/load-nyc-config@1.1.0",
    "license": "ISC",
    "repository": "https://github.com/istanbuljs/load-nyc-config"
  },
  {
    "name": "@istanbuljs/schema@0.1.6",
    "license": "MIT",
    "publisher": "Corey Farrell",
    "repository": "https://github.com/istanbuljs/schema"
  },
  {
    "name": "@jest/create-cache-key-function@29.7.0",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "@jest/environment@29.7.0",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "@jest/fake-timers@29.7.0",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "@jest/schemas@29.6.3",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "@jest/transform@29.7.0",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "@jest/types@29.6.3",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "@jridgewell/gen-mapping@0.3.13",
    "license": "MIT",
    "publisher": "Justin Ridgewell",
    "repository": "https://github.com/jridgewell/sourcemaps"
  },
  {
    "name": "@jridgewell/remapping@2.3.5",
    "license": "MIT",
    "publisher": "Justin Ridgewell",
    "repository": "https://github.com/jridgewell/sourcemaps"
  },
  {
    "name": "@jridgewell/resolve-uri@3.1.2",
    "license": "MIT",
    "publisher": "Justin Ridgewell",
    "repository": "https://github.com/jridgewell/resolve-uri"
  },
  {
    "name": "@jridgewell/source-map@0.3.11",
    "license": "MIT",
    "publisher": "Justin Ridgewell",
    "repository": "https://github.com/jridgewell/sourcemaps"
  },
  {
    "name": "@jridgewell/sourcemap-codec@1.5.5",
    "license": "MIT",
    "publisher": "Justin Ridgewell",
    "repository": "https://github.com/jridgewell/sourcemaps"
  },
  {
    "name": "@jridgewell/trace-mapping@0.3.31",
    "license": "MIT",
    "publisher": "Justin Ridgewell",
    "repository": "https://github.com/jridgewell/sourcemaps"
  },
  {
    "name": "@nodelib/fs.scandir@2.1.5",
    "license": "MIT",
    "repository": "https://github.com/nodelib/nodelib/tree/master/packages/fs/fs.scandir"
  },
  {
    "name": "@nodelib/fs.stat@2.0.5",
    "license": "MIT",
    "repository": "https://github.com/nodelib/nodelib/tree/master/packages/fs/fs.stat"
  },
  {
    "name": "@nodelib/fs.walk@1.2.8",
    "license": "MIT",
    "repository": "https://github.com/nodelib/nodelib/tree/master/packages/fs/fs.walk"
  },
  {
    "name": "@react-native-async-storage/async-storage@2.2.0",
    "license": "MIT",
    "publisher": "Krzysztof Borowy",
    "repository": "https://github.com/react-native-async-storage/async-storage"
  },
  {
    "name": "@react-native-camera-roll/camera-roll@7.10.2",
    "license": "MIT",
    "publisher": "Bartol Karuza",
    "repository": "https://github.com/react-native-cameraroll/react-native-cameraroll"
  },
  {
    "name": "@react-native-community/cli-clean@20.1.0",
    "license": "MIT",
    "repository": "https://github.com/react-native-community/cli"
  },
  {
    "name": "@react-native-community/cli-config-android@20.1.0",
    "license": "MIT",
    "repository": "https://github.com/react-native-community/cli"
  },
  {
    "name": "@react-native-community/cli-config-apple@20.1.0",
    "license": "MIT",
    "repository": "https://github.com/react-native-community/cli"
  },
  {
    "name": "@react-native-community/cli-config@20.1.0",
    "license": "MIT",
    "repository": "https://github.com/react-native-community/cli"
  },
  {
    "name": "@react-native-community/cli-doctor@20.1.0",
    "license": "MIT",
    "repository": "https://github.com/react-native-community/cli"
  },
  {
    "name": "@react-native-community/cli-platform-android@20.1.0",
    "license": "MIT",
    "repository": "https://github.com/react-native-community/cli"
  },
  {
    "name": "@react-native-community/cli-platform-apple@20.1.0",
    "license": "MIT",
    "repository": "https://github.com/react-native-community/cli"
  },
  {
    "name": "@react-native-community/cli-platform-ios@20.1.0",
    "license": "MIT",
    "repository": "https://github.com/react-native-community/cli"
  },
  {
    "name": "@react-native-community/cli-server-api@20.1.0",
    "license": "MIT",
    "repository": "https://github.com/react-native-community/cli"
  },
  {
    "name": "@react-native-community/cli-tools@20.1.0",
    "license": "MIT",
    "repository": "https://github.com/react-native-community/cli"
  },
  {
    "name": "@react-native-community/cli-types@20.1.0",
    "license": "MIT",
    "repository": "https://github.com/react-native-community/cli"
  },
  {
    "name": "@react-native-community/cli@20.1.0",
    "license": "MIT",
    "repository": "https://github.com/react-native-community/cli"
  },
  {
    "name": "@react-native-community/slider@5.2.0",
    "license": "MIT",
    "publisher": "react-native-community",
    "repository": "https://github.com/callstack/react-native-slider"
  },
  {
    "name": "@react-native/assets-registry@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/babel-plugin-codegen@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/babel-preset@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/codegen@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/community-cli-plugin@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/debugger-frontend@0.86.0",
    "license": "BSD-3-Clause",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/debugger-shell@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/dev-middleware@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/gradle-plugin@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/jest-preset@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/js-polyfills@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/metro-babel-transformer@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/metro-config@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/new-app-screen@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/normalize-colors@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@react-native/virtualized-lists@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "@sideway/address@4.1.5",
    "license": "BSD-3-Clause",
    "repository": "https://github.com/sideway/address"
  },
  {
    "name": "@sideway/formula@3.0.1",
    "license": "BSD-3-Clause",
    "repository": "https://github.com/sideway/formula"
  },
  {
    "name": "@sideway/pinpoint@2.0.0",
    "license": "BSD-3-Clause",
    "repository": "https://github.com/sideway/pinpoint"
  },
  {
    "name": "@sinclair/typebox@0.27.10",
    "license": "MIT",
    "publisher": "sinclairzx81",
    "repository": "https://github.com/sinclairzx81/typebox-legacy"
  },
  {
    "name": "@sinonjs/commons@3.0.1",
    "license": "BSD-3-Clause",
    "repository": "https://github.com/sinonjs/commons"
  },
  {
    "name": "@sinonjs/fake-timers@10.3.0",
    "license": "BSD-3-Clause",
    "publisher": "Christian Johansen",
    "repository": "https://github.com/sinonjs/fake-timers"
  },
  {
    "name": "@types/babel__core@7.20.5",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@types/babel__generator@7.27.0",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@types/babel__template@7.4.4",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@types/babel__traverse@7.28.0",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@types/graceful-fs@4.1.9",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@types/istanbul-lib-coverage@2.0.6",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@types/istanbul-lib-report@3.0.3",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@types/istanbul-reports@3.0.4",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@types/node@26.1.0",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@types/react@19.2.17",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@types/stack-utils@2.0.3",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@types/yargs-parser@21.0.3",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@types/yargs@17.0.35",
    "license": "MIT",
    "repository": "https://github.com/DefinitelyTyped/DefinitelyTyped"
  },
  {
    "name": "@vscode/sudo-prompt@9.3.2",
    "license": "MIT",
    "publisher": "Joran Dirk Greef",
    "repository": "https://github.com/microsoft/vscode-sudo-prompt"
  },
  {
    "name": "abort-controller@3.0.0",
    "license": "MIT",
    "publisher": "Toru Nagashima",
    "repository": "https://github.com/mysticatea/abort-controller"
  },
  {
    "name": "accepts@1.3.8",
    "license": "MIT",
    "repository": "https://github.com/jshttp/accepts"
  },
  {
    "name": "accepts@2.0.0",
    "license": "MIT",
    "repository": "https://github.com/jshttp/accepts"
  },
  {
    "name": "acorn@8.17.0",
    "license": "MIT",
    "repository": "https://github.com/acornjs/acorn"
  },
  {
    "name": "agent-base@7.1.4",
    "license": "MIT",
    "publisher": "Nathan Rajlich",
    "repository": "https://github.com/TooTallNate/proxy-agents"
  },
  {
    "name": "anser@1.4.10",
    "license": "MIT",
    "publisher": "Ionică Bizău",
    "repository": "https://github.com/IonicaBizau/anser"
  },
  {
    "name": "ansi-fragments@0.2.1",
    "license": "MIT",
    "publisher": "Paweł Trysła",
    "repository": "https://github.com/zamotany/ansi-fragments"
  },
  {
    "name": "ansi-regex@4.1.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/chalk/ansi-regex"
  },
  {
    "name": "ansi-regex@5.0.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/chalk/ansi-regex"
  },
  {
    "name": "ansi-styles@3.2.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/chalk/ansi-styles"
  },
  {
    "name": "ansi-styles@4.3.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/chalk/ansi-styles"
  },
  {
    "name": "ansi-styles@5.2.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/chalk/ansi-styles"
  },
  {
    "name": "anymatch@3.1.3",
    "license": "ISC",
    "publisher": "Elan Shanker",
    "repository": "https://github.com/micromatch/anymatch"
  },
  {
    "name": "appdirsjs@1.2.7",
    "license": "MIT",
    "repository": "https://github.com/codingjerk/appdirsjs"
  },
  {
    "name": "argparse@1.0.10",
    "license": "MIT",
    "repository": "https://github.com/nodeca/argparse"
  },
  {
    "name": "argparse@2.0.1",
    "license": "Python-2.0",
    "repository": "https://github.com/nodeca/argparse"
  },
  {
    "name": "asap@2.0.6",
    "license": "MIT",
    "repository": "https://github.com/kriskowal/asap"
  },
  {
    "name": "astral-regex@1.0.0",
    "license": "MIT",
    "publisher": "Kevin Mårtensson",
    "repository": "https://github.com/kevva/astral-regex"
  },
  {
    "name": "async-limiter@1.0.1",
    "license": "MIT",
    "publisher": "Samuel Reed",
    "repository": "https://github.com/strml/async-limiter"
  },
  {
    "name": "babel-jest@29.7.0",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "babel-plugin-istanbul@6.1.1",
    "license": "BSD-3-Clause",
    "publisher": "Thai Pangsakulyanont @dtinth",
    "repository": "https://github.com/istanbuljs/babel-plugin-istanbul"
  },
  {
    "name": "babel-plugin-jest-hoist@29.6.3",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "babel-plugin-polyfill-corejs2@0.4.17",
    "license": "MIT",
    "repository": "https://github.com/babel/babel-polyfills"
  },
  {
    "name": "babel-plugin-polyfill-corejs3@0.13.0",
    "license": "MIT",
    "repository": "https://github.com/babel/babel-polyfills"
  },
  {
    "name": "babel-plugin-polyfill-regenerator@0.6.8",
    "license": "MIT",
    "repository": "https://github.com/babel/babel-polyfills"
  },
  {
    "name": "babel-plugin-syntax-hermes-parser@0.36.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/hermes"
  },
  {
    "name": "babel-plugin-transform-flow-enums@0.0.2",
    "license": "MIT",
    "repository": "https://github.com/facebook/flow"
  },
  {
    "name": "babel-preset-current-node-syntax@1.2.0",
    "license": "MIT",
    "publisher": "Nicolò Ribaudo",
    "repository": "https://github.com/nicolo-ribaudo/babel-preset-current-node-syntax"
  },
  {
    "name": "babel-preset-jest@29.6.3",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "balanced-match@1.0.2",
    "license": "MIT",
    "publisher": "Julian Gruber",
    "repository": "https://github.com/juliangruber/balanced-match"
  },
  {
    "name": "base64-js@1.5.1",
    "license": "MIT",
    "publisher": "T. Jameson Little",
    "repository": "https://github.com/beatgammit/base64-js"
  },
  {
    "name": "baseline-browser-mapping@2.10.42",
    "license": "Apache-2.0",
    "repository": "https://github.com/web-platform-dx/baseline-browser-mapping"
  },
  {
    "name": "bl@4.1.0",
    "license": "MIT",
    "repository": "https://github.com/rvagg/bl"
  },
  {
    "name": "body-parser@1.20.5",
    "license": "MIT",
    "repository": "https://github.com/expressjs/body-parser"
  },
  {
    "name": "boolbase@1.0.0",
    "license": "ISC",
    "publisher": "Felix Boehm",
    "repository": "https://github.com/fb55/boolbase"
  },
  {
    "name": "brace-expansion@1.1.15",
    "license": "MIT",
    "publisher": "Julian Gruber",
    "repository": "https://github.com/juliangruber/brace-expansion"
  },
  {
    "name": "braces@3.0.3",
    "license": "MIT",
    "publisher": "Jon Schlinkert",
    "repository": "https://github.com/micromatch/braces"
  },
  {
    "name": "browserslist@4.28.4",
    "license": "MIT",
    "publisher": "Andrey Sitnik",
    "repository": "https://github.com/browserslist/browserslist"
  },
  {
    "name": "bser@2.1.1",
    "license": "Apache-2.0",
    "publisher": "Wez Furlong",
    "repository": "https://github.com/facebook/watchman"
  },
  {
    "name": "buffer-from@1.1.2",
    "license": "MIT",
    "repository": "https://github.com/LinusU/buffer-from"
  },
  {
    "name": "buffer@5.7.1",
    "license": "MIT",
    "publisher": "Feross Aboukhadijeh",
    "repository": "https://github.com/feross/buffer"
  },
  {
    "name": "bytes@3.1.2",
    "license": "MIT",
    "publisher": "TJ Holowaychuk",
    "repository": "https://github.com/visionmedia/bytes.js"
  },
  {
    "name": "call-bind-apply-helpers@1.0.2",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/ljharb/call-bind-apply-helpers"
  },
  {
    "name": "call-bound@1.0.4",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/ljharb/call-bound"
  },
  {
    "name": "callsites@3.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/callsites"
  },
  {
    "name": "camelcase@5.3.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/camelcase"
  },
  {
    "name": "camelcase@6.3.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/camelcase"
  },
  {
    "name": "caniuse-lite@1.0.30001800",
    "license": "CC-BY-4.0",
    "publisher": "Ben Briggs",
    "repository": "https://github.com/browserslist/caniuse-lite"
  },
  {
    "name": "chalk@4.1.2",
    "license": "MIT",
    "repository": "https://github.com/chalk/chalk"
  },
  {
    "name": "chrome-launcher@0.15.2",
    "license": "Apache-2.0",
    "publisher": "The Chromium Authors",
    "repository": "https://github.com/GoogleChrome/chrome-launcher"
  },
  {
    "name": "chromium-edge-launcher@0.3.0",
    "license": "Apache-2.0",
    "publisher": "Cezar Augusto",
    "repository": "https://github.com/cezaraugusto/chromium-edge-launcher"
  },
  {
    "name": "ci-info@2.0.0",
    "license": "MIT",
    "publisher": "Thomas Watson Steen",
    "repository": "https://github.com/watson/ci-info"
  },
  {
    "name": "ci-info@3.9.0",
    "license": "MIT",
    "publisher": "Thomas Watson Steen",
    "repository": "https://github.com/watson/ci-info"
  },
  {
    "name": "cli-cursor@3.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/cli-cursor"
  },
  {
    "name": "cli-spinners@2.9.2",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/cli-spinners"
  },
  {
    "name": "cliui@6.0.0",
    "license": "ISC",
    "publisher": "Ben Coe",
    "repository": "https://github.com/yargs/cliui"
  },
  {
    "name": "cliui@8.0.1",
    "license": "ISC",
    "publisher": "Ben Coe",
    "repository": "https://github.com/yargs/cliui"
  },
  {
    "name": "clone@1.0.4",
    "license": "MIT",
    "publisher": "Paul Vorbach",
    "repository": "https://github.com/pvorb/node-clone"
  },
  {
    "name": "color-convert@1.9.3",
    "license": "MIT",
    "publisher": "Heather Arthur",
    "repository": "https://github.com/Qix-/color-convert"
  },
  {
    "name": "color-convert@2.0.1",
    "license": "MIT",
    "publisher": "Heather Arthur",
    "repository": "https://github.com/Qix-/color-convert"
  },
  {
    "name": "color-name@1.1.3",
    "license": "MIT",
    "publisher": "DY",
    "repository": "https://github.com/dfcreative/color-name"
  },
  {
    "name": "color-name@1.1.4",
    "license": "MIT",
    "publisher": "DY",
    "repository": "https://github.com/colorjs/color-name"
  },
  {
    "name": "colorette@1.4.0",
    "license": "MIT",
    "publisher": "Jorge Bucaran",
    "repository": "https://github.com/jorgebucaran/colorette"
  },
  {
    "name": "command-exists@1.2.9",
    "license": "MIT",
    "publisher": "Matthew Conlen",
    "repository": "https://github.com/mathisonian/command-exists"
  },
  {
    "name": "commander@12.1.0",
    "license": "MIT",
    "publisher": "TJ Holowaychuk",
    "repository": "https://github.com/tj/commander.js"
  },
  {
    "name": "commander@2.20.3",
    "license": "MIT",
    "publisher": "TJ Holowaychuk",
    "repository": "https://github.com/tj/commander.js"
  },
  {
    "name": "commander@9.5.0",
    "license": "MIT",
    "publisher": "TJ Holowaychuk",
    "repository": "https://github.com/tj/commander.js"
  },
  {
    "name": "compressible@2.0.18",
    "license": "MIT",
    "repository": "https://github.com/jshttp/compressible"
  },
  {
    "name": "compression@1.8.1",
    "license": "MIT",
    "repository": "https://github.com/expressjs/compression"
  },
  {
    "name": "concat-map@0.0.1",
    "license": "MIT",
    "publisher": "James Halliday",
    "repository": "https://github.com/substack/node-concat-map"
  },
  {
    "name": "connect@3.7.0",
    "license": "MIT",
    "publisher": "TJ Holowaychuk",
    "repository": "https://github.com/senchalabs/connect"
  },
  {
    "name": "content-type@1.0.5",
    "license": "MIT",
    "publisher": "Douglas Christopher Wilson",
    "repository": "https://github.com/jshttp/content-type"
  },
  {
    "name": "convert-source-map@2.0.0",
    "license": "MIT",
    "publisher": "Thorsten Lorenz",
    "repository": "https://github.com/thlorenz/convert-source-map"
  },
  {
    "name": "core-js-compat@3.49.0",
    "license": "MIT",
    "publisher": "Denis Pushkarev",
    "repository": "https://github.com/zloirock/core-js"
  },
  {
    "name": "cosmiconfig@9.0.2",
    "license": "MIT",
    "publisher": "Daniel Fischer",
    "repository": "https://github.com/cosmiconfig/cosmiconfig"
  },
  {
    "name": "cross-spawn@7.0.6",
    "license": "MIT",
    "publisher": "André Cruz",
    "repository": "https://github.com/moxystudio/node-cross-spawn"
  },
  {
    "name": "css-select@5.2.2",
    "license": "BSD-2-Clause",
    "publisher": "Felix Boehm",
    "repository": "https://github.com/fb55/css-select"
  },
  {
    "name": "css-tree@1.1.3",
    "license": "MIT",
    "publisher": "Roman Dvornov",
    "repository": "https://github.com/csstree/csstree"
  },
  {
    "name": "css-what@6.2.2",
    "license": "BSD-2-Clause",
    "publisher": "Felix Böhm",
    "repository": "https://github.com/fb55/css-what"
  },
  {
    "name": "csstype@3.2.3",
    "license": "MIT",
    "publisher": "Fredrik Nicol",
    "repository": "https://github.com/frenic/csstype"
  },
  {
    "name": "dayjs@1.11.21",
    "license": "MIT",
    "publisher": "iamkun",
    "repository": "https://github.com/iamkun/dayjs"
  },
  {
    "name": "debug@2.6.9",
    "license": "MIT",
    "publisher": "TJ Holowaychuk",
    "repository": "https://github.com/visionmedia/debug"
  },
  {
    "name": "debug@4.4.3",
    "license": "MIT",
    "publisher": "Josh Junon",
    "repository": "https://github.com/debug-js/debug"
  },
  {
    "name": "decamelize@1.2.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/decamelize"
  },
  {
    "name": "deepmerge@4.3.1",
    "license": "MIT",
    "repository": "https://github.com/TehShrike/deepmerge"
  },
  {
    "name": "defaults@1.0.4",
    "license": "MIT",
    "publisher": "Elijah Insua",
    "repository": "https://github.com/sindresorhus/node-defaults"
  },
  {
    "name": "depd@2.0.0",
    "license": "MIT",
    "publisher": "Douglas Christopher Wilson",
    "repository": "https://github.com/dougwilson/nodejs-depd"
  },
  {
    "name": "destroy@1.2.0",
    "license": "MIT",
    "publisher": "Jonathan Ong",
    "repository": "https://github.com/stream-utils/destroy"
  },
  {
    "name": "dom-serializer@2.0.0",
    "license": "MIT",
    "publisher": "Felix Boehm",
    "repository": "https://github.com/cheeriojs/dom-serializer"
  },
  {
    "name": "domelementtype@2.3.0",
    "license": "BSD-2-Clause",
    "publisher": "Felix Boehm",
    "repository": "https://github.com/fb55/domelementtype"
  },
  {
    "name": "domhandler@5.0.3",
    "license": "BSD-2-Clause",
    "publisher": "Felix Boehm",
    "repository": "https://github.com/fb55/domhandler"
  },
  {
    "name": "domutils@3.2.2",
    "license": "BSD-2-Clause",
    "publisher": "Felix Boehm",
    "repository": "https://github.com/fb55/domutils"
  },
  {
    "name": "dunder-proto@1.0.1",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/es-shims/dunder-proto"
  },
  {
    "name": "ee-first@1.1.1",
    "license": "MIT",
    "publisher": "Jonathan Ong",
    "repository": "https://github.com/jonathanong/ee-first"
  },
  {
    "name": "electron-to-chromium@1.5.387",
    "license": "ISC",
    "publisher": "Kilian Valkhof",
    "repository": "https://github.com/Kilian/electron-to-chromium"
  },
  {
    "name": "emoji-regex@8.0.0",
    "license": "MIT",
    "publisher": "Mathias Bynens",
    "repository": "https://github.com/mathiasbynens/emoji-regex"
  },
  {
    "name": "encodeurl@1.0.2",
    "license": "MIT",
    "repository": "https://github.com/pillarjs/encodeurl"
  },
  {
    "name": "encodeurl@2.0.0",
    "license": "MIT",
    "repository": "https://github.com/pillarjs/encodeurl"
  },
  {
    "name": "entities@4.5.0",
    "license": "BSD-2-Clause",
    "publisher": "Felix Boehm",
    "repository": "https://github.com/fb55/entities"
  },
  {
    "name": "env-paths@2.2.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/env-paths"
  },
  {
    "name": "envinfo@7.21.0",
    "license": "MIT",
    "publisher": "tabrindle@gmail.com",
    "repository": "https://github.com/tabrindle/envinfo"
  },
  {
    "name": "error-ex@1.3.4",
    "license": "MIT",
    "repository": "https://github.com/qix-/node-error-ex"
  },
  {
    "name": "error-stack-parser@2.1.4",
    "license": "MIT",
    "repository": "https://github.com/stacktracejs/error-stack-parser"
  },
  {
    "name": "errorhandler@1.5.2",
    "license": "MIT",
    "repository": "https://github.com/expressjs/errorhandler"
  },
  {
    "name": "es-define-property@1.0.1",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/ljharb/es-define-property"
  },
  {
    "name": "es-errors@1.3.0",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/ljharb/es-errors"
  },
  {
    "name": "es-object-atoms@1.1.2",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/ljharb/es-object-atoms"
  },
  {
    "name": "escalade@3.2.0",
    "license": "MIT",
    "publisher": "Luke Edwards",
    "repository": "https://github.com/lukeed/escalade"
  },
  {
    "name": "escape-html@1.0.3",
    "license": "MIT",
    "repository": "https://github.com/component/escape-html"
  },
  {
    "name": "escape-string-regexp@2.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/escape-string-regexp"
  },
  {
    "name": "escape-string-regexp@4.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/escape-string-regexp"
  },
  {
    "name": "esprima@4.0.1",
    "license": "BSD-2-Clause",
    "publisher": "Ariya Hidayat",
    "repository": "https://github.com/jquery/esprima"
  },
  {
    "name": "etag@1.8.1",
    "license": "MIT",
    "repository": "https://github.com/jshttp/etag"
  },
  {
    "name": "event-target-shim@5.0.1",
    "license": "MIT",
    "publisher": "Toru Nagashima",
    "repository": "https://github.com/mysticatea/event-target-shim"
  },
  {
    "name": "execa@5.1.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/execa"
  },
  {
    "name": "exponential-backoff@3.1.3",
    "license": "Apache-2.0",
    "publisher": "Sami Sayegh",
    "repository": "https://github.com/coveooss/exponential-backoff"
  },
  {
    "name": "fast-glob@3.3.3",
    "license": "MIT",
    "publisher": "Denis Malinochkin",
    "repository": "https://github.com/mrmlnc/fast-glob"
  },
  {
    "name": "fast-json-stable-stringify@2.1.0",
    "license": "MIT",
    "publisher": "James Halliday",
    "repository": "https://github.com/epoberezkin/fast-json-stable-stringify"
  },
  {
    "name": "fast-xml-parser@4.5.7",
    "license": "MIT",
    "publisher": "Amit Gupta",
    "repository": "https://github.com/NaturalIntelligence/fast-xml-parser"
  },
  {
    "name": "fastq@1.20.1",
    "license": "ISC",
    "publisher": "Matteo Collina",
    "repository": "https://github.com/mcollina/fastq"
  },
  {
    "name": "fb-dotslash@0.5.8",
    "license": "(MIT OR Apache-2.0)",
    "repository": "https://github.com/facebook/dotslash"
  },
  {
    "name": "fb-watchman@2.0.2",
    "license": "Apache-2.0",
    "publisher": "Wez Furlong",
    "repository": "https://github.com/facebook/watchman"
  },
  {
    "name": "fdir@6.5.0",
    "license": "MIT",
    "publisher": "thecodrr",
    "repository": "https://github.com/thecodrr/fdir"
  },
  {
    "name": "fill-range@7.1.1",
    "license": "MIT",
    "publisher": "Jon Schlinkert",
    "repository": "https://github.com/jonschlinkert/fill-range"
  },
  {
    "name": "finalhandler@1.1.2",
    "license": "MIT",
    "publisher": "Douglas Christopher Wilson",
    "repository": "https://github.com/pillarjs/finalhandler"
  },
  {
    "name": "find-up@4.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/find-up"
  },
  {
    "name": "find-up@5.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/find-up"
  },
  {
    "name": "flow-enums-runtime@0.0.6",
    "license": "MIT",
    "repository": "https://github.com/facebook/flow"
  },
  {
    "name": "fresh@0.5.2",
    "license": "MIT",
    "publisher": "TJ Holowaychuk",
    "repository": "https://github.com/jshttp/fresh"
  },
  {
    "name": "fs-extra@8.1.0",
    "license": "MIT",
    "publisher": "JP Richardson",
    "repository": "https://github.com/jprichardson/node-fs-extra"
  },
  {
    "name": "fs.realpath@1.0.0",
    "license": "ISC",
    "publisher": "Isaac Z. Schlueter",
    "repository": "https://github.com/isaacs/fs.realpath"
  },
  {
    "name": "fsevents@2.3.3",
    "license": "MIT",
    "repository": "https://github.com/fsevents/fsevents"
  },
  {
    "name": "function-bind@1.1.2",
    "license": "MIT",
    "publisher": "Raynos",
    "repository": "https://github.com/Raynos/function-bind"
  },
  {
    "name": "gensync@1.0.0-beta.2",
    "license": "MIT",
    "publisher": "Logan Smyth",
    "repository": "https://github.com/loganfsmyth/gensync"
  },
  {
    "name": "get-caller-file@2.0.5",
    "license": "ISC",
    "publisher": "Stefan Penner",
    "repository": "https://github.com/stefanpenner/get-caller-file"
  },
  {
    "name": "get-intrinsic@1.3.0",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/ljharb/get-intrinsic"
  },
  {
    "name": "get-package-type@0.1.0",
    "license": "MIT",
    "publisher": "Corey Farrell",
    "repository": "https://github.com/cfware/get-package-type"
  },
  {
    "name": "get-proto@1.0.1",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/ljharb/get-proto"
  },
  {
    "name": "get-stream@6.0.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/get-stream"
  },
  {
    "name": "glob-parent@5.1.2",
    "license": "ISC",
    "publisher": "Gulp Team",
    "repository": "https://github.com/gulpjs/glob-parent"
  },
  {
    "name": "glob@7.2.3",
    "license": "ISC",
    "publisher": "Isaac Z. Schlueter",
    "repository": "https://github.com/isaacs/node-glob"
  },
  {
    "name": "gopd@1.2.0",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/ljharb/gopd"
  },
  {
    "name": "graceful-fs@4.2.11",
    "license": "ISC",
    "repository": "https://github.com/isaacs/node-graceful-fs"
  },
  {
    "name": "has-flag@4.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/has-flag"
  },
  {
    "name": "has-symbols@1.1.0",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/inspect-js/has-symbols"
  },
  {
    "name": "hasown@2.0.4",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/inspect-js/hasOwn"
  },
  {
    "name": "hermes-compiler@250829098.0.14",
    "license": "MIT",
    "repository": "https://github.com/facebook/hermes"
  },
  {
    "name": "hermes-estree@0.35.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/hermes"
  },
  {
    "name": "hermes-estree@0.36.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/hermes"
  },
  {
    "name": "hermes-parser@0.35.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/hermes"
  },
  {
    "name": "hermes-parser@0.36.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/hermes"
  },
  {
    "name": "http-errors@2.0.1",
    "license": "MIT",
    "publisher": "Jonathan Ong",
    "repository": "https://github.com/jshttp/http-errors"
  },
  {
    "name": "https-proxy-agent@7.0.6",
    "license": "MIT",
    "publisher": "Nathan Rajlich",
    "repository": "https://github.com/TooTallNate/proxy-agents"
  },
  {
    "name": "human-signals@2.1.0",
    "license": "Apache-2.0",
    "publisher": "ehmicky",
    "repository": "https://github.com/ehmicky/human-signals"
  },
  {
    "name": "iconv-lite@0.4.24",
    "license": "MIT",
    "publisher": "Alexander Shtuchkin",
    "repository": "https://github.com/ashtuchkin/iconv-lite"
  },
  {
    "name": "ieee754@1.2.1",
    "license": "BSD-3-Clause",
    "publisher": "Feross Aboukhadijeh",
    "repository": "https://github.com/feross/ieee754"
  },
  {
    "name": "image-size@1.2.1",
    "license": "MIT",
    "publisher": "netroy",
    "repository": "https://github.com/image-size/image-size"
  },
  {
    "name": "import-fresh@3.3.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/import-fresh"
  },
  {
    "name": "imurmurhash@0.1.4",
    "license": "MIT",
    "publisher": "Jens Taylor",
    "repository": "https://github.com/jensyt/imurmurhash-js"
  },
  {
    "name": "inflight@1.0.6",
    "license": "ISC",
    "publisher": "Isaac Z. Schlueter",
    "repository": "https://github.com/npm/inflight"
  },
  {
    "name": "inherits@2.0.4",
    "license": "ISC",
    "repository": "https://github.com/isaacs/inherits"
  },
  {
    "name": "invariant@2.2.4",
    "license": "MIT",
    "publisher": "Andres Suarez",
    "repository": "https://github.com/zertosh/invariant"
  },
  {
    "name": "is-arrayish@0.2.1",
    "license": "MIT",
    "publisher": "Qix",
    "repository": "https://github.com/qix-/node-is-arrayish"
  },
  {
    "name": "is-core-module@2.16.2",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/inspect-js/is-core-module"
  },
  {
    "name": "is-docker@2.2.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/is-docker"
  },
  {
    "name": "is-extglob@2.1.1",
    "license": "MIT",
    "publisher": "Jon Schlinkert",
    "repository": "https://github.com/jonschlinkert/is-extglob"
  },
  {
    "name": "is-fullwidth-code-point@2.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/is-fullwidth-code-point"
  },
  {
    "name": "is-fullwidth-code-point@3.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/is-fullwidth-code-point"
  },
  {
    "name": "is-glob@4.0.3",
    "license": "MIT",
    "publisher": "Jon Schlinkert",
    "repository": "https://github.com/micromatch/is-glob"
  },
  {
    "name": "is-interactive@1.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/is-interactive"
  },
  {
    "name": "is-number@7.0.0",
    "license": "MIT",
    "publisher": "Jon Schlinkert",
    "repository": "https://github.com/jonschlinkert/is-number"
  },
  {
    "name": "is-plain-obj@2.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/is-plain-obj"
  },
  {
    "name": "is-stream@2.0.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/is-stream"
  },
  {
    "name": "is-unicode-supported@0.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/is-unicode-supported"
  },
  {
    "name": "is-wsl@1.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/is-wsl"
  },
  {
    "name": "is-wsl@2.2.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/is-wsl"
  },
  {
    "name": "isexe@2.0.0",
    "license": "ISC",
    "publisher": "Isaac Z. Schlueter",
    "repository": "https://github.com/isaacs/isexe"
  },
  {
    "name": "istanbul-lib-coverage@3.2.2",
    "license": "BSD-3-Clause",
    "publisher": "Krishnan Anantheswaran",
    "repository": "https://github.com/istanbuljs/istanbuljs"
  },
  {
    "name": "istanbul-lib-instrument@5.2.1",
    "license": "BSD-3-Clause",
    "publisher": "Krishnan Anantheswaran",
    "repository": "https://github.com/istanbuljs/istanbuljs"
  },
  {
    "name": "jest-environment-node@29.7.0",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "jest-get-type@29.6.3",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "jest-haste-map@29.7.0",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "jest-message-util@29.7.0",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "jest-mock@29.7.0",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "jest-regex-util@29.6.3",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "jest-util@29.7.0",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "jest-validate@29.7.0",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "jest-worker@29.7.0",
    "license": "MIT",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "joi@17.13.4",
    "license": "BSD-3-Clause",
    "repository": "https://github.com/hapijs/joi"
  },
  {
    "name": "js-tokens@4.0.0",
    "license": "MIT",
    "publisher": "Simon Lydell",
    "repository": "https://github.com/lydell/js-tokens"
  },
  {
    "name": "js-yaml@3.15.0",
    "license": "MIT",
    "publisher": "Vladimir Zapparov",
    "repository": "https://github.com/nodeca/js-yaml"
  },
  {
    "name": "js-yaml@4.3.0",
    "license": "MIT",
    "publisher": "Vladimir Zapparov",
    "repository": "https://github.com/nodeca/js-yaml"
  },
  {
    "name": "jsc-safe-url@0.2.4",
    "license": "0BSD",
    "publisher": "Rob Hogan",
    "repository": "https://github.com/robhogan/jsc-safe-url"
  },
  {
    "name": "jsesc@3.1.0",
    "license": "MIT",
    "publisher": "Mathias Bynens",
    "repository": "https://github.com/mathiasbynens/jsesc"
  },
  {
    "name": "json-parse-even-better-errors@2.3.1",
    "license": "MIT",
    "publisher": "Kat Marchán",
    "repository": "https://github.com/npm/json-parse-even-better-errors"
  },
  {
    "name": "json5@2.2.3",
    "license": "MIT",
    "publisher": "Aseem Kishore",
    "repository": "https://github.com/json5/json5"
  },
  {
    "name": "jsonfile@4.0.0",
    "license": "MIT",
    "publisher": "JP Richardson",
    "repository": "https://github.com/jprichardson/node-jsonfile"
  },
  {
    "name": "kleur@3.0.3",
    "license": "MIT",
    "publisher": "Luke Edwards",
    "repository": "https://github.com/lukeed/kleur"
  },
  {
    "name": "launch-editor@2.14.1",
    "license": "MIT",
    "publisher": "Evan You",
    "repository": "https://github.com/vitejs/launch-editor"
  },
  {
    "name": "leven@3.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/leven"
  },
  {
    "name": "lighthouse-logger@1.4.2",
    "license": "Apache-2.0"
  },
  {
    "name": "lines-and-columns@1.2.4",
    "license": "MIT",
    "publisher": "Brian Donovan",
    "repository": "https://github.com/eventualbuddha/lines-and-columns"
  },
  {
    "name": "locate-path@5.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/locate-path"
  },
  {
    "name": "locate-path@6.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/locate-path"
  },
  {
    "name": "lodash.debounce@4.0.8",
    "license": "MIT",
    "publisher": "John-David Dalton",
    "repository": "https://github.com/lodash/lodash"
  },
  {
    "name": "lodash.throttle@4.1.1",
    "license": "MIT",
    "publisher": "John-David Dalton",
    "repository": "https://github.com/lodash/lodash"
  },
  {
    "name": "log-symbols@4.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/log-symbols"
  },
  {
    "name": "logkitty@0.7.1",
    "license": "MIT",
    "publisher": "Paweł Trysła",
    "repository": "https://github.com/zamotany/logkitty"
  },
  {
    "name": "loose-envify@1.4.0",
    "license": "MIT",
    "publisher": "Andres Suarez",
    "repository": "https://github.com/zertosh/loose-envify"
  },
  {
    "name": "lru-cache@5.1.1",
    "license": "ISC",
    "publisher": "Isaac Z. Schlueter",
    "repository": "https://github.com/isaacs/node-lru-cache"
  },
  {
    "name": "makeerror@1.0.12",
    "license": "BSD-3-Clause",
    "publisher": "Naitik Shah",
    "repository": "https://github.com/daaku/nodejs-makeerror"
  },
  {
    "name": "marky@1.3.0",
    "license": "Apache-2.0",
    "publisher": "Nolan Lawson",
    "repository": "https://github.com/nolanlawson/marky"
  },
  {
    "name": "math-intrinsics@1.1.0",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/es-shims/math-intrinsics"
  },
  {
    "name": "mdn-data@2.0.14",
    "license": "CC0-1.0",
    "publisher": "Mozilla Developer Network",
    "repository": "https://github.com/mdn/data"
  },
  {
    "name": "media-typer@0.3.0",
    "license": "MIT",
    "publisher": "Douglas Christopher Wilson",
    "repository": "https://github.com/jshttp/media-typer"
  },
  {
    "name": "memoize-one@5.2.1",
    "license": "MIT",
    "publisher": "Alex Reardon",
    "repository": "https://github.com/alexreardon/memoize-one"
  },
  {
    "name": "merge-options@3.0.4",
    "license": "MIT",
    "publisher": "Michael Mayer",
    "repository": "https://github.com/schnittstabil/merge-options"
  },
  {
    "name": "merge-stream@2.0.0",
    "license": "MIT",
    "publisher": "Stephen Sugden",
    "repository": "https://github.com/grncdr/merge-stream"
  },
  {
    "name": "merge2@1.4.1",
    "license": "MIT",
    "repository": "https://github.com/teambition/merge2"
  },
  {
    "name": "metro-babel-transformer@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro-cache-key@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro-cache@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro-config@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro-core@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro-file-map@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro-minify-terser@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro-resolver@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro-runtime@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro-source-map@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro-symbolicate@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro-transform-plugins@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro-transform-worker@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "metro@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "micromatch@4.0.8",
    "license": "MIT",
    "publisher": "Jon Schlinkert",
    "repository": "https://github.com/micromatch/micromatch"
  },
  {
    "name": "mime-db@1.52.0",
    "license": "MIT",
    "repository": "https://github.com/jshttp/mime-db"
  },
  {
    "name": "mime-db@1.54.0",
    "license": "MIT",
    "repository": "https://github.com/jshttp/mime-db"
  },
  {
    "name": "mime-types@2.1.35",
    "license": "MIT",
    "repository": "https://github.com/jshttp/mime-types"
  },
  {
    "name": "mime-types@3.0.2",
    "license": "MIT",
    "repository": "https://github.com/jshttp/mime-types"
  },
  {
    "name": "mime@1.6.0",
    "license": "MIT",
    "publisher": "Robert Kieffer",
    "repository": "https://github.com/broofa/node-mime"
  },
  {
    "name": "mime@2.6.0",
    "license": "MIT",
    "publisher": "Robert Kieffer",
    "repository": "https://github.com/broofa/mime"
  },
  {
    "name": "mimic-fn@2.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/mimic-fn"
  },
  {
    "name": "minimatch@3.1.5",
    "license": "ISC",
    "publisher": "Isaac Z. Schlueter",
    "repository": "https://github.com/isaacs/minimatch"
  },
  {
    "name": "mkdirp@1.0.4",
    "license": "MIT",
    "repository": "https://github.com/isaacs/node-mkdirp"
  },
  {
    "name": "ms@2.0.0",
    "license": "MIT",
    "repository": "https://github.com/zeit/ms"
  },
  {
    "name": "ms@2.1.3",
    "license": "MIT",
    "repository": "https://github.com/vercel/ms"
  },
  {
    "name": "negotiator@0.6.3",
    "license": "MIT",
    "repository": "https://github.com/jshttp/negotiator"
  },
  {
    "name": "negotiator@0.6.4",
    "license": "MIT",
    "repository": "https://github.com/jshttp/negotiator"
  },
  {
    "name": "negotiator@1.0.0",
    "license": "MIT",
    "repository": "https://github.com/jshttp/negotiator"
  },
  {
    "name": "nocache@3.0.4",
    "license": "MIT",
    "publisher": "Adam Baldwin",
    "repository": "https://github.com/helmetjs/nocache"
  },
  {
    "name": "node-int64@0.4.0",
    "license": "MIT",
    "publisher": "Robert Kieffer",
    "repository": "https://github.com/broofa/node-int64"
  },
  {
    "name": "node-releases@2.0.50",
    "license": "MIT",
    "publisher": "Sergey Rubanov",
    "repository": "https://github.com/chicoxyzzy/node-releases"
  },
  {
    "name": "node-stream-zip@1.15.0",
    "license": "MIT",
    "publisher": "Antelle",
    "repository": "https://github.com/antelle/node-stream-zip"
  },
  {
    "name": "normalize-path@3.0.0",
    "license": "MIT",
    "publisher": "Jon Schlinkert",
    "repository": "https://github.com/jonschlinkert/normalize-path"
  },
  {
    "name": "npm-run-path@4.0.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/npm-run-path"
  },
  {
    "name": "nth-check@2.1.1",
    "license": "BSD-2-Clause",
    "publisher": "Felix Boehm",
    "repository": "https://github.com/fb55/nth-check"
  },
  {
    "name": "nullthrows@1.1.1",
    "license": "MIT",
    "publisher": "Andres Suarez",
    "repository": "https://github.com/zertosh/nullthrows"
  },
  {
    "name": "ob1@0.84.4",
    "license": "MIT",
    "repository": "https://github.com/facebook/metro"
  },
  {
    "name": "object-inspect@1.13.4",
    "license": "MIT",
    "publisher": "James Halliday",
    "repository": "https://github.com/inspect-js/object-inspect"
  },
  {
    "name": "on-finished@2.3.0",
    "license": "MIT",
    "repository": "https://github.com/jshttp/on-finished"
  },
  {
    "name": "on-finished@2.4.1",
    "license": "MIT",
    "repository": "https://github.com/jshttp/on-finished"
  },
  {
    "name": "on-headers@1.1.0",
    "license": "MIT",
    "publisher": "Douglas Christopher Wilson",
    "repository": "https://github.com/jshttp/on-headers"
  },
  {
    "name": "once@1.4.0",
    "license": "ISC",
    "publisher": "Isaac Z. Schlueter",
    "repository": "https://github.com/isaacs/once"
  },
  {
    "name": "onetime@5.1.2",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/onetime"
  },
  {
    "name": "open@6.4.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/open"
  },
  {
    "name": "open@7.4.2",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/open"
  },
  {
    "name": "ora@5.4.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/ora"
  },
  {
    "name": "p-limit@2.3.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/p-limit"
  },
  {
    "name": "p-limit@3.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/p-limit"
  },
  {
    "name": "p-locate@4.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/p-locate"
  },
  {
    "name": "p-locate@5.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/p-locate"
  },
  {
    "name": "p-try@2.2.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/p-try"
  },
  {
    "name": "parent-module@1.0.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/parent-module"
  },
  {
    "name": "parse-json@5.2.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/parse-json"
  },
  {
    "name": "parseurl@1.3.3",
    "license": "MIT",
    "repository": "https://github.com/pillarjs/parseurl"
  },
  {
    "name": "path-exists@4.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/path-exists"
  },
  {
    "name": "path-is-absolute@1.0.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/path-is-absolute"
  },
  {
    "name": "path-key@3.1.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/path-key"
  },
  {
    "name": "path-parse@1.0.7",
    "license": "MIT",
    "publisher": "Javier Blanco",
    "repository": "https://github.com/jbgutierrez/path-parse"
  },
  {
    "name": "picocolors@1.1.1",
    "license": "ISC",
    "publisher": "Alexey Raspopov",
    "repository": "https://github.com/alexeyraspopov/picocolors"
  },
  {
    "name": "picomatch@2.3.2",
    "license": "MIT",
    "publisher": "Jon Schlinkert",
    "repository": "https://github.com/micromatch/picomatch"
  },
  {
    "name": "picomatch@4.0.5",
    "license": "MIT",
    "publisher": "Jon Schlinkert",
    "repository": "https://github.com/micromatch/picomatch"
  },
  {
    "name": "pirates@4.0.7",
    "license": "MIT",
    "publisher": "Ari Porad",
    "repository": "https://github.com/danez/pirates"
  },
  {
    "name": "pretty-format@29.7.0",
    "license": "MIT",
    "publisher": "James Kyle",
    "repository": "https://github.com/jestjs/jest"
  },
  {
    "name": "promise@8.3.0",
    "license": "MIT",
    "publisher": "ForbesLindesay",
    "repository": "https://github.com/then/promise"
  },
  {
    "name": "prompts@2.4.2",
    "license": "MIT",
    "publisher": "Terkel Gjervig",
    "repository": "https://github.com/terkelg/prompts"
  },
  {
    "name": "qs@6.15.3",
    "license": "BSD-3-Clause",
    "repository": "https://github.com/ljharb/qs"
  },
  {
    "name": "queue-microtask@1.2.3",
    "license": "MIT",
    "publisher": "Feross Aboukhadijeh",
    "repository": "https://github.com/feross/queue-microtask"
  },
  {
    "name": "queue@6.0.2",
    "license": "MIT",
    "publisher": "Jesse Tane",
    "repository": "https://github.com/jessetane/queue"
  },
  {
    "name": "range-parser@1.2.1",
    "license": "MIT",
    "publisher": "TJ Holowaychuk",
    "repository": "https://github.com/jshttp/range-parser"
  },
  {
    "name": "raw-body@2.5.3",
    "license": "MIT",
    "publisher": "Jonathan Ong",
    "repository": "https://github.com/stream-utils/raw-body"
  },
  {
    "name": "react-devtools-core@6.1.5",
    "license": "MIT",
    "repository": "https://github.com/facebook/react"
  },
  {
    "name": "react-is@18.3.1",
    "license": "MIT",
    "repository": "https://github.com/facebook/react"
  },
  {
    "name": "react-native-image-picker@8.2.1",
    "license": "MIT",
    "publisher": "Johan du Toit",
    "repository": "https://github.com/react-native-image-picker/react-native-image-picker"
  },
  {
    "name": "react-native-safe-area-context@5.8.0",
    "license": "MIT",
    "publisher": "Janic Duplessis",
    "repository": "https://github.com/AppAndFlow/react-native-safe-area-context"
  },
  {
    "name": "react-native-svg@15.15.5",
    "license": "MIT",
    "repository": "https://github.com/software-mansion/react-native-svg"
  },
  {
    "name": "react-native@0.86.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react-native"
  },
  {
    "name": "react-refresh@0.14.2",
    "license": "MIT",
    "repository": "https://github.com/facebook/react"
  },
  {
    "name": "react@19.2.3",
    "license": "MIT",
    "repository": "https://github.com/facebook/react"
  },
  {
    "name": "readable-stream@3.6.2",
    "license": "MIT",
    "repository": "https://github.com/nodejs/readable-stream"
  },
  {
    "name": "regenerate-unicode-properties@10.2.2",
    "license": "MIT",
    "publisher": "Mathias Bynens",
    "repository": "https://github.com/mathiasbynens/regenerate-unicode-properties"
  },
  {
    "name": "regenerate@1.4.2",
    "license": "MIT",
    "publisher": "Mathias Bynens",
    "repository": "https://github.com/mathiasbynens/regenerate"
  },
  {
    "name": "regenerator-runtime@0.13.11",
    "license": "MIT",
    "publisher": "Ben Newman",
    "repository": "https://github.com/facebook/regenerator/tree/main/packages/runtime"
  },
  {
    "name": "regexpu-core@6.4.0",
    "license": "MIT",
    "publisher": "Mathias Bynens",
    "repository": "https://github.com/mathiasbynens/regexpu-core"
  },
  {
    "name": "regjsgen@0.8.0",
    "license": "MIT",
    "publisher": "Benjamin Tan",
    "repository": "https://github.com/bnjmnt4n/regjsgen"
  },
  {
    "name": "regjsparser@0.13.2",
    "license": "BSD-2-Clause",
    "publisher": "'Julian Viereck'",
    "repository": "https://github.com/jviereck/regjsparser"
  },
  {
    "name": "require-directory@2.1.1",
    "license": "MIT",
    "publisher": "Troy Goode",
    "repository": "https://github.com/troygoode/node-require-directory"
  },
  {
    "name": "require-main-filename@2.0.0",
    "license": "ISC",
    "publisher": "Ben Coe",
    "repository": "https://github.com/yargs/require-main-filename"
  },
  {
    "name": "resolve-from@4.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/resolve-from"
  },
  {
    "name": "resolve-from@5.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/resolve-from"
  },
  {
    "name": "resolve@1.22.12",
    "license": "MIT",
    "publisher": "James Halliday",
    "repository": "https://github.com/browserify/resolve"
  },
  {
    "name": "restore-cursor@3.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/restore-cursor"
  },
  {
    "name": "reusify@1.1.0",
    "license": "MIT",
    "publisher": "Matteo Collina",
    "repository": "https://github.com/mcollina/reusify"
  },
  {
    "name": "run-parallel@1.2.0",
    "license": "MIT",
    "publisher": "Feross Aboukhadijeh",
    "repository": "https://github.com/feross/run-parallel"
  },
  {
    "name": "safe-buffer@5.2.1",
    "license": "MIT",
    "publisher": "Feross Aboukhadijeh",
    "repository": "https://github.com/feross/safe-buffer"
  },
  {
    "name": "safer-buffer@2.1.2",
    "license": "MIT",
    "publisher": "Nikita Skovoroda",
    "repository": "https://github.com/ChALkeR/safer-buffer"
  },
  {
    "name": "scheduler@0.27.0",
    "license": "MIT",
    "repository": "https://github.com/facebook/react"
  },
  {
    "name": "semver@6.3.1",
    "license": "ISC",
    "publisher": "GitHub Inc.",
    "repository": "https://github.com/npm/node-semver"
  },
  {
    "name": "semver@7.8.5",
    "license": "ISC",
    "publisher": "GitHub Inc.",
    "repository": "https://github.com/npm/node-semver"
  },
  {
    "name": "send@0.19.2",
    "license": "MIT",
    "publisher": "TJ Holowaychuk",
    "repository": "https://github.com/pillarjs/send"
  },
  {
    "name": "serialize-error@2.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/serialize-error"
  },
  {
    "name": "serve-static@1.16.3",
    "license": "MIT",
    "publisher": "Douglas Christopher Wilson",
    "repository": "https://github.com/expressjs/serve-static"
  },
  {
    "name": "set-blocking@2.0.0",
    "license": "ISC",
    "publisher": "Ben Coe",
    "repository": "https://github.com/yargs/set-blocking"
  },
  {
    "name": "setprototypeof@1.2.0",
    "license": "ISC",
    "publisher": "Wes Todd",
    "repository": "https://github.com/wesleytodd/setprototypeof"
  },
  {
    "name": "shebang-command@2.0.0",
    "license": "MIT",
    "publisher": "Kevin Mårtensson",
    "repository": "https://github.com/kevva/shebang-command"
  },
  {
    "name": "shebang-regex@3.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/shebang-regex"
  },
  {
    "name": "shell-quote@1.9.0",
    "license": "MIT",
    "publisher": "James Halliday",
    "repository": "https://github.com/ljharb/shell-quote"
  },
  {
    "name": "side-channel-list@1.0.1",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/ljharb/side-channel-list"
  },
  {
    "name": "side-channel-map@1.0.1",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/ljharb/side-channel-map"
  },
  {
    "name": "side-channel-weakmap@1.0.2",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/ljharb/side-channel-weakmap"
  },
  {
    "name": "side-channel@1.1.1",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/ljharb/side-channel"
  },
  {
    "name": "signal-exit@3.0.7",
    "license": "ISC",
    "publisher": "Ben Coe",
    "repository": "https://github.com/tapjs/signal-exit"
  },
  {
    "name": "sisteransi@1.0.5",
    "license": "MIT",
    "publisher": "Terkel Gjervig",
    "repository": "https://github.com/terkelg/sisteransi"
  },
  {
    "name": "slash@3.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/slash"
  },
  {
    "name": "slice-ansi@2.1.0",
    "license": "MIT",
    "repository": "https://github.com/chalk/slice-ansi"
  },
  {
    "name": "source-map-support@0.5.21",
    "license": "MIT",
    "repository": "https://github.com/evanw/node-source-map-support"
  },
  {
    "name": "source-map@0.5.7",
    "license": "BSD-3-Clause",
    "publisher": "Nick Fitzgerald",
    "repository": "https://github.com/mozilla/source-map"
  },
  {
    "name": "source-map@0.6.1",
    "license": "BSD-3-Clause",
    "publisher": "Nick Fitzgerald",
    "repository": "https://github.com/mozilla/source-map"
  },
  {
    "name": "sprintf-js@1.0.3",
    "license": "BSD-3-Clause",
    "publisher": "Alexandru Marasteanu",
    "repository": "https://github.com/alexei/sprintf.js"
  },
  {
    "name": "stack-utils@2.0.6",
    "license": "MIT",
    "publisher": "James Talmage",
    "repository": "https://github.com/tapjs/stack-utils"
  },
  {
    "name": "stackframe@1.3.4",
    "license": "MIT",
    "repository": "https://github.com/stacktracejs/stackframe"
  },
  {
    "name": "stacktrace-parser@0.1.11",
    "license": "MIT",
    "publisher": "Georg Tavonius",
    "repository": "https://github.com/errwischt/stacktrace-parser"
  },
  {
    "name": "statuses@1.5.0",
    "license": "MIT",
    "repository": "https://github.com/jshttp/statuses"
  },
  {
    "name": "statuses@2.0.2",
    "license": "MIT",
    "repository": "https://github.com/jshttp/statuses"
  },
  {
    "name": "string_decoder@1.3.0",
    "license": "MIT",
    "repository": "https://github.com/nodejs/string_decoder"
  },
  {
    "name": "string-width@4.2.3",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/string-width"
  },
  {
    "name": "strip-ansi@5.2.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/chalk/strip-ansi"
  },
  {
    "name": "strip-ansi@6.0.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/chalk/strip-ansi"
  },
  {
    "name": "strip-final-newline@2.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/strip-final-newline"
  },
  {
    "name": "strnum@1.1.2",
    "license": "MIT",
    "publisher": "Amit Gupta",
    "repository": "https://github.com/NaturalIntelligence/strnum"
  },
  {
    "name": "supports-color@7.2.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/chalk/supports-color"
  },
  {
    "name": "supports-color@8.1.1",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/chalk/supports-color"
  },
  {
    "name": "supports-preserve-symlinks-flag@1.0.0",
    "license": "MIT",
    "publisher": "Jordan Harband",
    "repository": "https://github.com/inspect-js/node-supports-preserve-symlinks-flag"
  },
  {
    "name": "terser@5.48.0",
    "license": "BSD-2-Clause",
    "publisher": "Mihai Bazon",
    "repository": "https://github.com/terser/terser"
  },
  {
    "name": "test-exclude@6.0.0",
    "license": "ISC",
    "publisher": "Ben Coe",
    "repository": "https://github.com/istanbuljs/test-exclude"
  },
  {
    "name": "throat@5.0.0",
    "license": "MIT",
    "publisher": "ForbesLindesay",
    "repository": "https://github.com/ForbesLindesay/throat"
  },
  {
    "name": "tinyglobby@0.2.17",
    "license": "MIT",
    "publisher": "Superchupu",
    "repository": "https://github.com/SuperchupuDev/tinyglobby"
  },
  {
    "name": "tmpl@1.0.5",
    "license": "BSD-3-Clause",
    "publisher": "Naitik Shah",
    "repository": "https://github.com/daaku/nodejs-tmpl"
  },
  {
    "name": "to-regex-range@5.0.1",
    "license": "MIT",
    "publisher": "Jon Schlinkert",
    "repository": "https://github.com/micromatch/to-regex-range"
  },
  {
    "name": "toidentifier@1.0.1",
    "license": "MIT",
    "publisher": "Douglas Christopher Wilson",
    "repository": "https://github.com/component/toidentifier"
  },
  {
    "name": "type-detect@4.0.8",
    "license": "MIT",
    "publisher": "Jake Luer",
    "repository": "https://github.com/chaijs/type-detect"
  },
  {
    "name": "type-fest@0.7.1",
    "license": "(MIT OR CC0-1.0)",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/type-fest"
  },
  {
    "name": "type-is@1.6.18",
    "license": "MIT",
    "repository": "https://github.com/jshttp/type-is"
  },
  {
    "name": "typescript@5.9.3",
    "license": "Apache-2.0",
    "publisher": "Microsoft Corp.",
    "repository": "https://github.com/microsoft/TypeScript"
  },
  {
    "name": "undici-types@8.3.0",
    "license": "MIT",
    "repository": "https://github.com/nodejs/undici"
  },
  {
    "name": "unicode-canonical-property-names-ecmascript@2.0.1",
    "license": "MIT",
    "publisher": "Mathias Bynens",
    "repository": "https://github.com/mathiasbynens/unicode-canonical-property-names-ecmascript"
  },
  {
    "name": "unicode-match-property-ecmascript@2.0.0",
    "license": "MIT",
    "publisher": "Mathias Bynens",
    "repository": "https://github.com/mathiasbynens/unicode-match-property-ecmascript"
  },
  {
    "name": "unicode-match-property-value-ecmascript@2.2.1",
    "license": "MIT",
    "publisher": "Mathias Bynens",
    "repository": "https://github.com/mathiasbynens/unicode-match-property-value-ecmascript"
  },
  {
    "name": "unicode-property-aliases-ecmascript@2.2.0",
    "license": "MIT",
    "publisher": "Mathias Bynens",
    "repository": "https://github.com/mathiasbynens/unicode-property-aliases-ecmascript"
  },
  {
    "name": "universalify@0.1.2",
    "license": "MIT",
    "publisher": "Ryan Zimmerman",
    "repository": "https://github.com/RyanZim/universalify"
  },
  {
    "name": "unpipe@1.0.0",
    "license": "MIT",
    "publisher": "Douglas Christopher Wilson",
    "repository": "https://github.com/stream-utils/unpipe"
  },
  {
    "name": "update-browserslist-db@1.2.3",
    "license": "MIT",
    "publisher": "Andrey Sitnik",
    "repository": "https://github.com/browserslist/update-db"
  },
  {
    "name": "util-deprecate@1.0.2",
    "license": "MIT",
    "publisher": "Nathan Rajlich",
    "repository": "https://github.com/TooTallNate/util-deprecate"
  },
  {
    "name": "utils-merge@1.0.1",
    "license": "MIT",
    "publisher": "Jared Hanson",
    "repository": "https://github.com/jaredhanson/utils-merge"
  },
  {
    "name": "vary@1.1.2",
    "license": "MIT",
    "publisher": "Douglas Christopher Wilson",
    "repository": "https://github.com/jshttp/vary"
  },
  {
    "name": "vlq@1.0.1",
    "license": "MIT",
    "publisher": "Rich Harris",
    "repository": "https://github.com/Rich-Harris/vlq"
  },
  {
    "name": "walker@1.0.8",
    "license": "Apache-2.0",
    "publisher": "Naitik Shah",
    "repository": "https://github.com/daaku/nodejs-walker"
  },
  {
    "name": "wcwidth@1.0.1",
    "license": "MIT",
    "publisher": "Tim Oxley",
    "repository": "https://github.com/timoxley/wcwidth"
  },
  {
    "name": "whatwg-fetch@3.6.20",
    "license": "MIT",
    "repository": "https://github.com/github/fetch"
  },
  {
    "name": "which-module@2.0.1",
    "license": "ISC",
    "publisher": "nexdrew",
    "repository": "https://github.com/nexdrew/which-module"
  },
  {
    "name": "which@2.0.2",
    "license": "ISC",
    "publisher": "Isaac Z. Schlueter",
    "repository": "https://github.com/isaacs/node-which"
  },
  {
    "name": "wrap-ansi@6.2.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/chalk/wrap-ansi"
  },
  {
    "name": "wrap-ansi@7.0.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/chalk/wrap-ansi"
  },
  {
    "name": "wrappy@1.0.2",
    "license": "ISC",
    "publisher": "Isaac Z. Schlueter",
    "repository": "https://github.com/npm/wrappy"
  },
  {
    "name": "write-file-atomic@4.0.2",
    "license": "ISC",
    "publisher": "GitHub Inc.",
    "repository": "https://github.com/npm/write-file-atomic"
  },
  {
    "name": "ws@6.2.4",
    "license": "MIT",
    "publisher": "Einar Otto Stangvik",
    "repository": "https://github.com/websockets/ws"
  },
  {
    "name": "ws@7.5.11",
    "license": "MIT",
    "publisher": "Einar Otto Stangvik",
    "repository": "https://github.com/websockets/ws"
  },
  {
    "name": "y18n@4.0.3",
    "license": "ISC",
    "publisher": "Ben Coe",
    "repository": "https://github.com/yargs/y18n"
  },
  {
    "name": "y18n@5.0.8",
    "license": "ISC",
    "publisher": "Ben Coe",
    "repository": "https://github.com/yargs/y18n"
  },
  {
    "name": "yallist@3.1.1",
    "license": "ISC",
    "publisher": "Isaac Z. Schlueter",
    "repository": "https://github.com/isaacs/yallist"
  },
  {
    "name": "yaml@2.9.0",
    "license": "ISC",
    "publisher": "Eemeli Aro",
    "repository": "https://github.com/eemeli/yaml"
  },
  {
    "name": "yargs-parser@18.1.3",
    "license": "ISC",
    "publisher": "Ben Coe",
    "repository": "https://github.com/yargs/yargs-parser"
  },
  {
    "name": "yargs-parser@21.1.1",
    "license": "ISC",
    "publisher": "Ben Coe",
    "repository": "https://github.com/yargs/yargs-parser"
  },
  {
    "name": "yargs@15.4.1",
    "license": "MIT",
    "repository": "https://github.com/yargs/yargs"
  },
  {
    "name": "yargs@17.7.3",
    "license": "MIT",
    "repository": "https://github.com/yargs/yargs"
  },
  {
    "name": "yocto-queue@0.1.0",
    "license": "MIT",
    "publisher": "Sindre Sorhus",
    "repository": "https://github.com/sindresorhus/yocto-queue"
  }
];
