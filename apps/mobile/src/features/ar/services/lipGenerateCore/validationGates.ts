import {
  LipGeneratePackage,
  LipGeneratePrivacy,
  LipGenerateRequest,
  LipGenerateResult,
  REQUIRED_PACKAGE_FIELDS,
} from "./contracts";

export type GateReport = {
  status: "ready" | "partial" | "blocked";
  warnings: string[];
  blockers: string[];
};

export function validatePrivacyFlags(
  privacy: LipGeneratePrivacy | undefined
): GateReport {
  const blockers: string[] = [];

  if (!privacy?.localOnly) {
    blockers.push("privacy.localOnly_must_be_true");
  }
  if (privacy?.offDeviceUpload !== false) {
    blockers.push("privacy.offDeviceUpload_must_be_false");
  }
  if (privacy?.longTermRawFrameStored !== false) {
    blockers.push("privacy.longTermRawFrameStored_must_be_false");
  }

  return {
    status: blockers.length ? "blocked" : "ready",
    warnings: [],
    blockers,
  };
}

export function validateGenerateRequest(
  request: LipGenerateRequest
): GateReport {
  const privacy = validatePrivacyFlags(request.privacy);
  const blockers = [...privacy.blockers];
  const warnings: string[] = [];

  if (!request.requestId) {
    blockers.push("missing_requestId");
  }
  if (!request.provider) {
    blockers.push("missing_provider");
  }
  if (!request.expressionMode) {
    blockers.push("missing_expressionMode");
  }
  if (request.frameSource === "fixture" && !request.fixtureId) {
    blockers.push("fixture_frameSource_requires_fixtureId");
  }
  for (const key of [
    "cornerReach",
    "upperLipTightness",
    "lowerLipTightness",
    "verticalOffset",
    "innerFill",
    "upperInnerFill",
  ] as const) {
    const value = request.adjustment?.[key];
    if (typeof value !== "number" || Number.isNaN(value)) {
      blockers.push(`invalid_adjustment_${key}`);
    } else if (value < -1 || value > 1) {
      warnings.push(`adjustment_${key}_outside_recommended_range`);
    }
  }

  return {
    status: blockers.length ? "blocked" : warnings.length ? "partial" : "ready",
    warnings,
    blockers,
  };
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateGeneratedPackage(
  generatedPackage: LipGeneratePackage
): GateReport {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const runtimePayload = generatedPackage.runtimeApplyPayload;
  const record = generatedPackage as unknown as Record<string, unknown>;
  const addPrivacyBlockers = (prefix: string, report: GateReport) => {
    blockers.push(...report.blockers.map((blocker) => `${prefix}.${blocker}`));
  };

  for (const field of REQUIRED_PACKAGE_FIELDS) {
    if (record[field] === undefined || record[field] === null) {
      blockers.push(`missing_package_field:${field}`);
    }
  }
  if (!generatedPackage.uvMaskTexture) {
    blockers.push("missing_uv_mask_texture");
  }
  if (!generatedPackage.roundTripPreview) {
    blockers.push("missing_round_trip_preview");
  }
  if (!generatedPackage.captureSetId) {
    blockers.push("missing_captureSetId");
  }
  if (!generatedPackage.providerResults?.[generatedPackage.provider]) {
    blockers.push("missing_provider_result_for_selected_provider");
  }
  if (
    generatedPackage.blendshapeAssist?.enabled !==
    (generatedPackage.expressionMode === "blendshapeAssist")
  ) {
    blockers.push("blendshapeAssist.enabled_must_match_expressionMode");
  }
  addPrivacyBlockers("runtime_payload", validatePrivacyFlags(runtimePayload));
  addPrivacyBlockers(
    "package_privacy_flags",
    validatePrivacyFlags(generatedPackage.privacyFlags)
  );
  if (runtimePayload?.maskTextureEncoding !== "raw_rgba_base64") {
    blockers.push(
      "runtime_payload.maskTextureEncoding_must_be_raw_rgba_base64"
    );
  }
  if (!runtimePayload?.maskRawRgbaBase64) {
    blockers.push("runtime_payload.missing_maskRawRgbaBase64");
  }
  if (!isPositiveFiniteNumber(runtimePayload?.maskTextureWidth)) {
    blockers.push("runtime_payload.invalid_maskTextureWidth");
  }
  if (!isPositiveFiniteNumber(runtimePayload?.maskTextureHeight)) {
    blockers.push("runtime_payload.invalid_maskTextureHeight");
  }
  if (runtimePayload?.runtimeReady) {
    warnings.push("runtime_ready_claim_requires_device_evidence");
  }
  if (
    generatedPackage.uvCoverageMetadata?.roundTripKind ===
    "same_frame_self_reconstruction"
  ) {
    warnings.push("same_frame_round_trip_is_projection_sanity_only");
  }

  return {
    status: blockers.length ? "blocked" : warnings.length ? "partial" : "ready",
    warnings,
    blockers,
  };
}

export function summarizeResultGate(result: LipGenerateResult): GateReport {
  const blockers: string[] = [];
  const warnings = [...result.warnings];

  if (!result.uvMaskReady) {
    blockers.push("uv_mask_not_ready");
  }
  if (!result.roundTripReady) {
    blockers.push("round_trip_not_ready");
  }
  if (result.runtimeApplyReady) {
    warnings.push("runtime_apply_ready_requires_real_device_evidence");
  }
  if (result.package) {
    const packageGate = validateGeneratedPackage(result.package);
    blockers.push(...packageGate.blockers);
    warnings.push(...packageGate.warnings);
  } else {
    blockers.push("missing_generated_package");
  }

  return {
    status: blockers.length ? "blocked" : warnings.length ? "partial" : "ready",
    warnings: Array.from(new Set(warnings)).sort(),
    blockers: Array.from(new Set(blockers)).sort(),
  };
}
