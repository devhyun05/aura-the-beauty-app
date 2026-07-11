"""Checkpoint-6 pre-registered A/B holdout runner (CHECKPOINT6_PROTOCOL.md).

Everything decision-relevant is FROZEN in this file at the §6-1 freeze commit:
arm commits, material selection, blind rule, panel construction, machine
measurements, and the K1~K5 aggregation. After the freeze commit, editing any
of it voids the checkpoint (§7 exhaustion).

Arms (§3):
  A = frozen baseline  : lab tree at ARM_A_COMMIT (mask v4 / maskv4_b3 era,
      lamaMaxDim 512, modelMaskDilate 0.004 — known negative false-fire, R3)
  B = challenger       : lab tree at ARM_B_COMMIT (v4.1 hardening + fill
      factorial verdict, lamaMaxDim 1024, modelMaskDilate 0.02)
Both arms run in detached git worktrees pinned to those commits, same venv,
same input bytes, LaMa weights pinned by spike/lama_manifest.json (identical
at both commits).

Frozen outcome vocabulary (per photo, per arm):
  served   : run_photo produced a result image and verdict == "pass"
             (the product serves the edited image)
  noop     : run_photo returned a "skip" record (empty mask / global no-op)
             — the product serves the ORIGINAL FILE unchanged, so editPx=0
             and byte identity HOLDS by construction
  abstain  : prepare/aperture/gate abstain or verdict == "abstain"
             — no output is served
  hardfail : verdict == "hard-fail" (serving veto) — no output is served
  gatefail : capture gate failed (should not occur on gate-passed material;
             counted as a failure like abstain)

Frozen aggregation (§8):
  K1  negative 10 (B): pass iff every photo is `noop` (editPx=0 AND identity).
      `abstain`/`hardfail` are flagged separately but still fail K1 (no
      output -> identity cannot hold). `served` fails with measured editPx.
  K2  anatomy 0/30 (B side of stubble+medium): judge's per-side anatomy
      checkbox mapped to arms at unseal; any B-side mark -> fail.
  K3  stubble 15: photo counts iff B not in {abstain, hardfail, gatefail}
      AND none of the 3 items was judged for the A side. Pass iff >= 12/15.
  K4  medium 15: same rule, >= 12/15.
  K5  primary 5 (B): processed = status in {served, noop}; 5/5 required.
  K6  variants are folded into K1/K3/K4 denominators + raw variant-vs-base
      table (no separate bar).
  R1  dense probe (3): raw items/anatomy/abstain report only — no gate.
  R2  count of positives with >= 1 B-item win and 0 A-item wins.
  R3  A-arm negative behaviour: status + editPx per photo.
  Overall PASS iff K1 & K2 & K3 & K4 & K5.

Blind rule (§4): salt = secrets.token_hex(16) generated once at panel build;
sha256(salt + ":" + stem) first hex digit even -> A is LEFT, odd -> A is
RIGHT. Mapping lives ONLY in cp6_run/blind_mapping.sealed.json (chmod 400);
the armA/armB output dirs are chmod 000 after the build so the judge can
only browse cp6_run/panels/. `unseal` restores permissions.

Usage (in §6 order; RUN_DIR = 아카이브/webset_cp6/cp6_run):
  checkpoint6.py freeze-info                  # §6-1 hashes for the protocol
  checkpoint6.py manifest                     # §6-2 seal the 28 sources
  checkpoint6.py variants                     # §6-3a make 15 variants, seal
  checkpoint6.py panel --worktree-root DIR    # §6-3b/c arms + blind panels
  checkpoint6.py unseal --judgments FILE      # §6-5/6 aggregate + verdict
  checkpoint6.py arm-driver --lab L --photos P --out O   # internal
Dev smoke only: --run-dir/--photos-override allow driving the machinery with
dev photos in a scratch dir; they MUST NOT be pointed at holdout material
before the real §6-3 build (§7).
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import secrets
import stat
import subprocess
import sys
import time
from pathlib import Path

SPIKE = Path(__file__).resolve().parent
LAB = SPIKE.parent
REPO = LAB.parents[1]
VENV_PY = LAB / ".venv" / "bin" / "python"
ARCHIVE = REPO / "아카이브"
WEBSET = ARCHIVE / "webset_cp6"
DEFAULT_RUN_DIR = WEBSET / "cp6_run"

ARM_A_COMMIT = "cadfe81ab1c956b6f7505c46ffc2f8dab348f4dc"
ARM_B_COMMIT = "8bb295005c9d0d34a3f3988d3972b1c6df98e18c"
WEIGHTS_SHA256 = "344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9"

# --- §2 materials (frozen; verify_selection() re-derives §2.2/§2.3 from the
# webset manifest rule and hard-asserts equality before any sealing step). ---
PRIMARY = [
    # (stem, path relative to 아카이브/, layer)
    ("IMG_4572", "denceKorean/IMG_4572.JPG", "dense"),
    ("IMG_4570", "denceKorean/IMG_4570.JPG", "medium"),
    ("IMG_4575", "denceKorean/IMG_4575.JPG", "stubble"),
    ("IMG_4561", "IMG_4561.JPG", "negative"),
    ("IMG_4565", "IMG_4565.JPG", "negative"),
]
SEL = {
    "negative": ["none_wikimedia_g01.jpg", "none_wikimedia_03.jpg",
                 "none_wikimedia_01.png", "none_wikimedia_g02.jpg",
                 "none_wikimedia_02.jpg"],
    "stubble": ["stubble_wikimedia_g03.jpg", "stubble_wikimedia_g04.jpg",
                "stubble_wikimedia_g05.jpg", "stubble_wikimedia_02.jpg",
                "stubble_wikimedia_06.jpg", "stubble_wikimedia_g01.jpg",
                "stubble_wikimedia_g06.jpg", "stubble_wikimedia_03.jpg"],
    "medium": ["medium_flickr_91.jpg", "medium_wikimedia_g02.jpg",
               "medium_unsplash_06.jpg", "medium_wikimedia_05.jpg",
               "medium_wikimedia_g04.jpg", "medium_wikimedia_g03.jpg",
               "medium_pexels_01.jpg", "medium_wikimedia_04.jpg"],
    "dense": ["dense_wikimedia_g01.jpg", "dense_wikimedia_g02.jpg"],
}
SEL_N = {"negative": 5, "stubble": 8, "medium": 8, "dense": 2}
VARIANT_BASES = ["stubble_wikimedia_g03.jpg", "stubble_wikimedia_g04.jpg",
                 "medium_flickr_91.jpg", "medium_wikimedia_g02.jpg",
                 "none_wikimedia_g01.jpg"]
VARIANT_KINDS = ("beauty", "jpeg40", "down06")
JUDGED_LAYERS = ("stubble", "medium", "dense")
BLOCKING = {"stubble": 12, "medium": 12}  # of 15 (§8 K3/K4)

NO_SERVE = ("abstain", "hardfail", "gatefail")
ITEMS = ("item1", "item2", "item3")
ITEM_LABELS = {
    "item1": "① 수염 잔존 — 어느 쪽이 수염(잔존 그림자·점묘 포함)을 더 완전히 제거했는가",
    "item2": "② 피부 자연스러움 — 어느 쪽 피부가 더 자연스러운가(왁스감·결 소실·색 편차·줄무늬)",
    "item3": "③ 해부 보존 — 어느 쪽이 입술·콧구멍·턱선·인중을 원본대로 보존했는가(환각 구조물 = 즉시 열세)",
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def now() -> str:
    return _dt.datetime.now().isoformat(timespec="seconds")


def webset_layer(name: str) -> str:
    return {"none": "negative"}.get(name.split("_")[0], name.split("_")[0])


def verify_selection() -> None:
    """Re-derive §2.2/§2.3 from the webset manifest pool rule and assert the
    frozen lists are its unique solution. Filename-only computation — touches
    no image bytes."""
    m = json.loads((WEBSET / "manifest.json").read_text())
    pool: dict[str, list[str]] = {}
    for name, v in m["files"].items():
        if not v.get("gateOk"):
            continue
        if name.startswith("cand_") or "_spare" in name:
            continue
        txt = (v.get("license", "") + " " + v.get("note", ""))
        if "1904" in txt or "아이누" in txt or "19세기" in txt:
            continue
        pool.setdefault(webset_layer(name), []).append(name)
    for layer, want in SEL.items():
        got = sorted(pool.get(layer, []),
                     key=lambda n: hashlib.sha256(n.encode()).hexdigest())
        got = got[:SEL_N[layer]]
        assert got == want, f"§2.2 selection mismatch [{layer}]:\n{got}\n{want}"
    sel_all = [n for names in SEL.values() for n in names]
    by_layer: dict[str, list[str]] = {}
    for n in sel_all:
        by_layer.setdefault(webset_layer(n), []).append(n)
    bases = []
    for layer, k in (("stubble", 2), ("medium", 2), ("negative", 1)):
        bases += sorted(by_layer[layer],
                        key=lambda n: hashlib.sha256(n.encode()).hexdigest())[:k]
    assert bases == VARIANT_BASES, f"§2.3 base mismatch: {bases}"


def materials(run_dir: Path) -> list[dict]:
    """The frozen 43: primary 5 + webset 23 + variants 15 (variant paths point
    into run_dir/variants whether or not generated yet)."""
    mats = []
    for stem, rel, layer in PRIMARY:
        mats.append({"stem": stem, "path": str(ARCHIVE / rel), "layer": layer,
                     "kind": "primary"})
    for layer, names in SEL.items():
        for n in names:
            mats.append({"stem": Path(n).stem, "path": str(WEBSET / n),
                         "layer": layer, "kind": "webset"})
    for base in VARIANT_BASES:
        for kind in VARIANT_KINDS:
            stem = f"{Path(base).stem}__{kind}"
            mats.append({"stem": stem,
                         "path": str(run_dir / "variants" / f"{stem}.png"),
                         "layer": webset_layer(base), "kind": "variant"})
    assert len(mats) == 43 and len({m["stem"] for m in mats}) == 43
    for m in mats:
        m["judged"] = m["layer"] in JUDGED_LAYERS
    counts = {}
    for m in mats:
        counts[m["layer"]] = counts.get(m["layer"], 0) + 1
    assert counts == {"stubble": 15, "medium": 15, "negative": 10, "dense": 3}
    return mats


# --------------------------------------------------------------- freeze-info
def cmd_freeze_info(args) -> int:
    weights = LAB / "external" / "models" / "big-lama" / "big-lama.pt"
    wsha = sha256_file(weights)
    pin = json.loads((SPIKE / "lama_manifest.json").read_text())["sha256"]
    assert wsha == pin == WEIGHTS_SHA256, "weights sha mismatch vs pins"
    freeze = subprocess.run([str(VENV_PY), "-m", "pip", "freeze"],
                            capture_output=True, text=True, check=True).stdout
    venv_sha = hashlib.sha256(
        "\n".join(sorted(freeze.strip().splitlines())).encode()).hexdigest()
    verify_selection()
    env = {"recordedAt": now(),
           "armA": {"commit": ARM_A_COMMIT, "weightsSha256": wsha},
           "armB": {"commit": ARM_B_COMMIT, "weightsSha256": wsha},
           "venvPipFreezeSha256": venv_sha,
           "python": sys.version.split()[0]}
    run_dir = Path(args.run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "environment.json").write_text(
        json.dumps(env, indent=2) + "\n")
    (run_dir / "pip_freeze.txt").write_text(freeze)
    print(json.dumps(env, indent=2))
    return 0


# ------------------------------------------------------------------ manifest
def cmd_manifest(args) -> int:
    verify_selection()
    run_dir = Path(args.run_dir)
    out = run_dir / "image_manifest.json"
    if out.exists():
        raise SystemExit(f"{out} exists — 재료 교체 불가 (§6-2)")
    run_dir.mkdir(parents=True, exist_ok=True)
    sources = {}
    for m in materials(run_dir):
        if m["kind"] == "variant":
            continue
        p = Path(m["path"])
        assert p.exists(), f"missing source {p}"
        sources[m["stem"]] = {"file": p.name, "layer": m["layer"],
                              "kind": m["kind"], "bytes": p.stat().st_size,
                              "sha256": sha256_file(p)}
    assert len(sources) == 28
    out.write_text(json.dumps(
        {"protocol": "docs/beard-simulation/CHECKPOINT6_PROTOCOL.md",
         "sealedAt": now(), "sources": sources,
         "variants": "pending — deterministic generation at §6-3 build only"},
        indent=2, ensure_ascii=False) + "\n")
    print(f"sealed 28 sources -> {out}")
    return 0


def _verify_manifest(run_dir: Path, *, want_variants: bool) -> dict:
    man = json.loads((run_dir / "image_manifest.json").read_text())
    mats = {m["stem"]: m for m in materials(run_dir)}
    for stem, rec in man["sources"].items():
        got = sha256_file(Path(mats[stem]["path"]))
        assert got == rec["sha256"], f"source hash changed: {stem}"
    if want_variants:
        assert isinstance(man["variants"], dict), "variants not sealed yet"
        assert len(man["variants"]) == 15
        for stem, rec in man["variants"].items():
            got = sha256_file(Path(mats[stem]["path"]))
            assert got == rec["sha256"], f"variant hash changed: {stem}"
    return man


# ------------------------------------------------------------------ variants
def cmd_variants(args) -> int:
    verify_selection()
    run_dir = Path(args.run_dir)
    vdir = run_dir / "variants"
    if vdir.exists():
        raise SystemExit(f"{vdir} exists — 규율 8: no overwriting runs")
    _verify_manifest(run_dir, want_variants=False)
    bases = [str(WEBSET / b) for b in VARIANT_BASES]
    subprocess.run([str(VENV_PY), str(WEBSET / "make_filter_variants.py"),
                    "--checkpoint-build", "--out", str(vdir)] + bases,
                   check=True)
    man_path = run_dir / "image_manifest.json"
    man = json.loads(man_path.read_text())
    variants = {}
    for m in materials(run_dir):
        if m["kind"] != "variant":
            continue
        p = Path(m["path"])
        assert p.exists(), f"variant not generated: {p}"
        variants[m["stem"]] = {"file": p.name, "layer": m["layer"],
                               "kind": "variant", "bytes": p.stat().st_size,
                               "sha256": sha256_file(p)}
    man["variants"] = variants
    man["variantsSealedAt"] = now()
    man_path.write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n")
    print(f"sealed 15 variants -> {man_path}")
    return 0


# ---------------------------------------------------------------- arm driver
def cmd_arm_driver(args) -> int:
    lab = Path(args.lab).resolve()
    sys.path.insert(0, str(lab))
    import cv2
    from engine.detect_face import detect_face            # arm's own code
    from engine.lower_face_roi import build_lower_face_crop
    from eval.run_owndomain_eval import _fit
    from spike import hybrid_recon as HR
    from spike import lama_runner
    assert Path(HR.__file__).resolve().is_relative_to(lab), "wrong arm tree"

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    lama_runner.get_model()
    photos = json.loads(Path(args.photos).read_text())
    recs = {}
    for p in photos:
        stem, path = p["stem"], Path(p["path"])
        t0 = time.perf_counter()
        rec = HR.run_photo(stem, path, out)
        if rec is None:
            status = "gatefail"
        elif rec.get("verdict") == "abstain":
            status = "abstain"
        elif rec.get("verdict") == "hard-fail":
            status = "hardfail"
        elif rec.get("skip"):
            status = "noop"
        else:
            assert (out / f"{stem}_result.png").exists(), f"{stem}: no result"
            status = "served"

        entry: dict = {"status": status, "layer": p["layer"],
                       "seconds": round(time.perf_counter() - t0, 2),
                       "rec": rec}
        bgr = _fit(cv2.imread(str(path), cv2.IMREAD_COLOR))
        det = detect_face(bgr) if bgr is not None else None
        if det is not None and det.quality.passed:
            crop = build_lower_face_crop(
                bgr, det.landmarks, det.face_width, det.face_height,
                under_jaw_extend=HR.CONFIG["underJawExtend"])
            cv2.imwrite(str(out / f"{stem}_crop_orig.png"), crop.bgr)
            entry["bbox"] = [int(v) for v in crop.bbox]
            if status == "served":
                res = cv2.imread(str(out / f"{stem}_result.png"),
                                 cv2.IMREAD_COLOR)
                assert res.shape == crop.bgr.shape, f"{stem}: shape mismatch"
                entry["editPx"] = int(
                    (res != crop.bgr).any(axis=2).sum())
        if status == "noop":
            entry["editPx"] = 0
            entry["byteIdentity"] = True   # product serves the original file
        elif status == "served":
            entry["byteIdentity"] = False
        else:
            entry["byteIdentity"] = None   # no output -> identity cannot hold
        recs[stem] = entry
        print(f"[driver] {stem}: {status} ({entry['seconds']}s)", flush=True)

    (out / "driver_report.json").write_text(json.dumps(
        {"lab": str(lab), "config": HR.CONFIG,
         "meta": lama_runner.run_metadata(), "finishedAt": now(),
         "photos": recs}, indent=2, default=str))
    print(f"[driver] done: {len(recs)} photos -> {out}")
    return 0


# ------------------------------------------------------------------- worktree
def _ensure_worktree(root: Path, name: str, commit: str) -> Path:
    wt = root / name
    if wt.exists():
        head = subprocess.run(["git", "-C", str(wt), "rev-parse", "HEAD"],
                              capture_output=True, text=True, check=True
                              ).stdout.strip()
        assert head == commit, f"{wt} pinned to {head}, want {commit}"
    else:
        root.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "-C", str(REPO), "worktree", "add", "--detach",
                        str(wt), commit], check=True)
    wt_lab = wt / "tools" / "beard-simulation-lab"
    ext = wt_lab / "external"
    if not ext.exists():
        ext.symlink_to(LAB / "external")
    return wt_lab


# --------------------------------------------------------------------- panel
def _tile(img, text, shape):
    import cv2
    import numpy as np
    if img is None:
        img = np.zeros(shape, np.uint8)
        cv2.putText(img, "ABSTAIN", (12, shape[0] // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)
    bar = np.zeros((34, img.shape[1], 3), np.uint8)
    cv2.putText(bar, text, (8, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                (255, 255, 255), 2)
    return np.vstack([bar, img])


def cmd_panel(args) -> int:
    import cv2
    import numpy as np
    run_dir = Path(args.run_dir)
    panels = run_dir / "panels"
    if panels.exists():
        raise SystemExit(f"{panels} exists — 규율 8: no overwriting runs")
    verify_selection()
    if not args.photos_override:
        _verify_manifest(run_dir, want_variants=True)
        mats = materials(run_dir)
    else:  # dev smoke only — never point this at holdout material (§7)
        mats = json.loads(Path(args.photos_override).read_text())

    wt_root = Path(args.worktree_root)
    labs = {"A": _ensure_worktree(wt_root, "armA", ARM_A_COMMIT),
            "B": _ensure_worktree(wt_root, "armB", ARM_B_COMMIT)}
    photolist = run_dir / "photolist.json"
    run_dir.mkdir(parents=True, exist_ok=True)
    photolist.write_text(json.dumps(mats, indent=2))

    env = {**os.environ, "OMP_NUM_THREADS": "4", "MKL_NUM_THREADS": "4"}
    for arm, wt_lab in labs.items():
        arm_out = run_dir / f"arm{arm}"
        log = run_dir / f"arm{arm}_driver.log"
        with open(log, "w") as lf:
            subprocess.run([str(VENV_PY), str(SPIKE / "checkpoint6.py"),
                            "arm-driver", "--lab", str(wt_lab),
                            "--photos", str(photolist),
                            "--out", str(arm_out)],
                           stdout=lf, stderr=subprocess.STDOUT,
                           env=env, check=True)
        print(f"arm {arm} done ({wt_lab})")

    reports = {a: json.loads((run_dir / f"arm{a}" / "driver_report.json"
                              ).read_text()) for a in "AB"}
    for m in mats:
        s = m["stem"]
        ba = reports["A"]["photos"][s].get("bbox")
        bb = reports["B"]["photos"][s].get("bbox")
        assert ba == bb, f"{s}: crop bbox differs between arms {ba} vs {bb}"

    # §4 blind mapping + panels (judged photos only; negatives are machine-
    # measured, §5).
    salt = secrets.token_hex(16)
    panels.mkdir()
    mapping = {}
    sides_public = {}
    for m in sorted((m for m in mats if m["judged"]), key=lambda x: x["stem"]):
        s = m["stem"]
        a_left = int(hashlib.sha256(f"{salt}:{s}".encode()).hexdigest()[0],
                     16) % 2 == 0
        order = ["A", "B"] if a_left else ["B", "A"]
        orig = cv2.imread(str(run_dir / "armB" / f"{s}_crop_orig.png"),
                          cv2.IMREAD_COLOR)
        assert orig is not None, f"{s}: missing crop orig"
        tiles = [_tile(orig, "ORIG", orig.shape)]
        for arm, letter in zip(order, ("L", "R")):
            st = reports[arm]["photos"][s]["status"]
            img = None
            if st == "served":
                img = cv2.imread(str(run_dir / f"arm{arm}" /
                                     f"{s}_result.png"), cv2.IMREAD_COLOR)
                assert img is not None
            elif st == "noop":
                img = orig
            tiles.append(_tile(img, letter, orig.shape))
            sides_public.setdefault(s, {})[letter] = (
                "abstain" if st in NO_SERVE else st)
        cv2.imwrite(str(panels / f"{s}.png"), np.hstack(tiles))
        mapping[s] = {"L": order[0], "R": order[1]}

    sealed = run_dir / "blind_mapping.sealed.json"
    sealed.write_text(json.dumps(
        {"salt": salt, "createdAt": now(), "mapping": mapping}, indent=2))
    os.chmod(sealed, 0o400)

    # Judgment form + machine template (§5: one judgment per item, no redo).
    form = ["# 체크포인트 ⑥ 판정표 (§5 — 항목별 좌/우/tie 각 1회, 재판정 금지)", "",
            "판정 전 안내(동결): 각 패널은 [ORIG | L | R]. L/R의 정체(A/B)는 봉인되어",
            "있습니다. 항목마다 더 나은 쪽(L/R) 또는 tie를 한 번만 적습니다.",
            "ABSTAIN 타일 = 그 팔이 출력을 내지 않음(그 자체로 판정 대상).", ""]
    for k in ITEMS:
        form.append(f"- {ITEM_LABELS[k]}")
    form += ["- anatomy 훼손(승패와 별도, 팔별): 제2의 입/이빨 환각, 콧구멍 소실,"
             " 턱선 붕괴 등 원본 대비 구조 변형이 보이면 해당 쪽에 O", "",
             "| 사진 | 층 | ① | ② | ③ | anatomy L | anatomy R | 메모 |",
             "|---|---|---|---|---|---|---|---|"]
    template = {}
    for m in sorted((m for m in mats if m["judged"]), key=lambda x: x["stem"]):
        s = m["stem"]
        form.append(f"| {s} | {m['layer']} |  |  |  |  |  |  |")
        template[s] = {"item1": "", "item2": "", "item3": "",
                       "anatomyL": False, "anatomyR": False, "note": ""}
    (run_dir / "judgment_form.md").write_text("\n".join(form) + "\n")
    (run_dir / "judgments.template.json").write_text(
        json.dumps(template, indent=2, ensure_ascii=False) + "\n")
    (run_dir / "build_report.json").write_text(json.dumps(
        {"builtAt": now(), "sidesPublic": sides_public,
         "panelCount": len(mapping)}, indent=2))

    # Seal the arm dirs: the judge may browse panels/ + the form ONLY (§4).
    for a in "AB":
        os.chmod(run_dir / f"arm{a}", 0o000)
    print(f"panels: {len(mapping)} -> {panels}\nmapping sealed (chmod 400), "
          "arm dirs chmod 000 — 판정 완료 전 열람 = §7 소진")
    return 0


# -------------------------------------------------------------------- unseal
def cmd_unseal(args) -> int:
    run_dir = Path(args.run_dir)
    for a in "AB":
        d = run_dir / f"arm{a}"
        if d.exists():
            os.chmod(d, 0o700)
    sealed_path = run_dir / "blind_mapping.sealed.json"
    os.chmod(sealed_path, stat.S_IRUSR | stat.S_IWUSR)
    sealed = json.loads(sealed_path.read_text())
    mapping = sealed["mapping"]
    judgments = json.loads(Path(args.judgments).read_text())
    reports = {a: json.loads((run_dir / f"arm{a}" / "driver_report.json"
                              ).read_text())["photos"] for a in "AB"}
    if not args.photos_override:
        mats = materials(run_dir)
    else:
        mats = json.loads(Path(args.photos_override).read_text())
    by_stem = {m["stem"]: m for m in mats}

    # validate: every judged photo, every item, exactly L/R/tie
    for s, mp in mapping.items():
        j = judgments.get(s)
        assert j, f"판정 누락: {s}"
        for k in ITEMS:
            assert j.get(k) in ("L", "R", "tie"), f"{s}.{k}={j.get(k)!r}"

    def arm_of(s: str, side: str) -> str:
        return mapping[s][side]

    def side_of(s: str, arm: str) -> str:
        return "L" if mapping[s]["L"] == arm else "R"

    rows = []          # per judged photo, unblinded
    for s, mp in sorted(mapping.items()):
        j = judgments[s]
        items_by_arm = {k: ("tie" if j[k] == "tie" else arm_of(s, j[k]))
                        for k in ITEMS}
        rows.append({
            "stem": s, "layer": by_stem[s]["layer"],
            "kind": by_stem[s]["kind"],
            "statusA": reports["A"][s]["status"],
            "statusB": reports["B"][s]["status"],
            "items": items_by_arm,
            "aWins": sum(1 for v in items_by_arm.values() if v == "A"),
            "bWins": sum(1 for v in items_by_arm.values() if v == "B"),
            "anatomyA": bool(j.get("anatomy" + side_of(s, "A"))),
            "anatomyB": bool(j.get("anatomy" + side_of(s, "B"))),
            "note": j.get("note", ""),
        })

    def layer_rows(layer):
        return [r for r in rows if r["layer"] == layer]

    def nonregression(r):
        return r["statusB"] not in NO_SERVE and r["aWins"] == 0

    k = {}
    # K1 — negatives, arm B, machine-measured.
    negs = [m["stem"] for m in mats if m["layer"] == "negative"]
    k1_rows = []
    for s in negs:
        e = reports["B"][s]
        ok = e["status"] == "noop"
        k1_rows.append({"stem": s, "status": e["status"],
                        "editPx": e.get("editPx"),
                        "byteIdentity": e.get("byteIdentity"), "pass": ok})
    k["K1"] = {"pass": all(r["pass"] for r in k1_rows),
               "raw": f"{sum(r['pass'] for r in k1_rows)}/{len(k1_rows)}",
               "rows": k1_rows}
    # K2 — anatomy 0/30 on B side (stubble+medium only).
    pos = layer_rows("stubble") + layer_rows("medium")
    bad = [r["stem"] for r in pos if r["anatomyB"]]
    k["K2"] = {"pass": not bad, "raw": f"훼손 {len(bad)}/30", "photos": bad}
    # K3/K4 — non-regression >= 12/15.
    for key, layer in (("K3", "stubble"), ("K4", "medium")):
        rs = layer_rows(layer)
        n = sum(1 for r in rs if nonregression(r))
        k[key] = {"pass": n >= BLOCKING[layer], "raw": f"{n}/{len(rs)}",
                  "fails": [r["stem"] for r in rs if not nonregression(r)]}
    # K5 — primary 5/5 processed by B.
    prim = [m["stem"] for m in mats if m["kind"] == "primary"]
    k5_rows = {s: reports["B"][s]["status"] for s in prim}
    k["K5"] = {"pass": all(v in ("served", "noop") for v in k5_rows.values()),
               "raw": f"{sum(v in ('served', 'noop') for v in k5_rows.values())}/5",
               "rows": k5_rows}
    overall = all(k[x]["pass"] for x in ("K1", "K2", "K3", "K4", "K5"))

    # K6 — variant vs base raw table (informational, already in K denoms).
    k6 = []
    for r in rows:
        if r["kind"] != "variant":
            continue
        base = r["stem"].split("__")[0]
        base_row = next((x for x in rows if x["stem"] == base), None)
        k6.append({"variant": r["stem"],
                   "nonRegression": nonregression(r),
                   "baseNonRegression": (nonregression(base_row)
                                         if base_row else None)})
    # R1 — dense probe raw.
    r1 = [{k2: r[k2] for k2 in ("stem", "statusA", "statusB", "items",
                                "anatomyA", "anatomyB", "note")}
          for r in layer_rows("dense")]
    # R2 — pure improvement count.
    r2 = sum(1 for r in pos if nonregression(r) and r["bWins"] >= 1)
    # R3 — arm A negative behaviour.
    r3 = [{"stem": s, "status": reports["A"][s]["status"],
           "editPx": reports["A"][s].get("editPx")} for s in negs]

    verdict = {"finishedAt": now(), "overallPass": overall, "gates": k,
               "K6_variants": k6, "R1_dense": r1,
               "R2_pureImprovement": f"{r2}/30", "R3_armA_negatives": r3,
               "rows": rows,
               "denseCaveat": "dense 일반화는 표본 부족(현대 실사 1 + 프로브 2)으로 미입증 (§1)"}
    (run_dir / "verdict.json").write_text(
        json.dumps(verdict, indent=2, ensure_ascii=False, default=str) + "\n")

    lines = [f"# 체크포인트 ⑥ 결과 ({now()})", "",
             f"**종합: {'합격 — B를 새 frozen baseline으로 승격' if overall else '불합격 — B 기각 (§9)'}**", "",
             "| 게이트 | 원자료 | 판정 |", "|---|---|---|"]
    for key in ("K1", "K2", "K3", "K4", "K5"):
        lines.append(f"| {key} | {k[key]['raw']} | "
                     f"{'PASS' if k[key]['pass'] else 'FAIL'} |")
    lines += ["", f"R2 순수 개선: {r2}/30 · R1 dense 프로브: 원자료 verdict.json",
              "", verdict["denseCaveat"]]
    (run_dir / "verdict_report.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({x: {"pass": k[x]["pass"], "raw": k[x]["raw"]}
                      for x in ("K1", "K2", "K3", "K4", "K5")},
                     ensure_ascii=False, indent=2))
    print(f"\noverall: {'PASS' if overall else 'FAIL'} -> "
          f"{run_dir / 'verdict_report.md'}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run-dir", default=str(DEFAULT_RUN_DIR),
                    help="dev smoke only — real runs use the default")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("freeze-info")
    sub.add_parser("manifest")
    sub.add_parser("variants")
    p = sub.add_parser("panel")
    p.add_argument("--worktree-root", required=True)
    p.add_argument("--photos-override", help="dev smoke only")
    d = sub.add_parser("arm-driver")
    d.add_argument("--lab", required=True)
    d.add_argument("--photos", required=True)
    d.add_argument("--out", required=True)
    u = sub.add_parser("unseal")
    u.add_argument("--judgments", required=True)
    u.add_argument("--photos-override", help="dev smoke only")
    args = ap.parse_args()
    return {"freeze-info": cmd_freeze_info, "manifest": cmd_manifest,
            "variants": cmd_variants, "panel": cmd_panel,
            "arm-driver": cmd_arm_driver, "unseal": cmd_unseal}[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
