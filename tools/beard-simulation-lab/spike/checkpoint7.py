"""Checkpoint-7 pre-registered A/B holdout runner (CHECKPOINT7_PROTOCOL.md).

Reuses checkpoint6's frozen machinery (sha256/manifest/worktree/driver/blind
rule) and overrides what the ⑦ protocol changes:

  * materials: webset_cp7 24 sources (stubble 7 / medium 9 / none 8) + 15
    deterministic filter variants — no dense layer, no primary photos.
  * arms: A = 8bb2950 (cp6 challenger, pre-repair), B = entry-gate repair
    round (ARM_B_COMMIT below).
  * panels show the RAW FILL whenever one was produced — quality-gate
    verdicts (pass/abstain/hard-fail) do NOT hide the image (§0-1); the
    serving contract is recorded separately for the R2 gate-vs-human table.
    ABSTAIN tiles appear only when no fill exists (entry abstain); no-op
    shows the unchanged original.
  * judgment: ①②③ comparative (L/R/tie, report axis) + per-side USABLE and
    per-side anatomy checkboxes (blocking axes).
  * gates: K1 negative served-accidents 0/11 · K2 anatomy 0 · K3 stubble
    usable >=7/13 · K4 medium usable >=8/15 · K5 fill-production >=22/28.

Usage (§6 order; RUN_DIR = 아카이브/webset_cp7/cp7_run):
  checkpoint7.py freeze-info | manifest | variants
  checkpoint7.py panel --worktree-root DIR
  checkpoint7.py unseal --judgments FILE
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import stat
import subprocess
import sys
from pathlib import Path

SPIKE = Path(__file__).resolve().parent
sys.path.insert(0, str(SPIKE.parent))

from spike import checkpoint6 as c6  # noqa: E402  (frozen cp6 machinery)

REPO = c6.REPO
WEBSET7 = c6.ARCHIVE / "webset_cp7"
RUN_DIR = WEBSET7 / "cp7_run"

ARM_A_COMMIT = "8bb295005c9d0d34a3f3988d3972b1c6df98e18c"   # cp6 challenger
ARM_B_COMMIT = "78eeb0cfa3ae73cd27ce061ef183c7cd01f4d387"   # entry-gate repair
WEIGHTS_SHA256 = c6.WEIGHTS_SHA256

CELLS = {"stubble": 7, "medium": 9, "none": 8}
VARIANT_BASES = ["stubble_cp7_07.jpg", "stubble_cp7_06.jpg",
                 "medium_cp7_07.jpg", "medium_cp7_09.jpg", "none_cp7_06.jpg"]
GATES = {"K3": ("stubble", 7, 13), "K4": ("medium", 8, 15)}
K5_MIN, K5_DEN = 22, 28
ITEMS = c6.ITEMS


def verify_selection() -> None:
    """⑦ pool = the whole gateOk webset (no sub-selection); assert cell
    sizes and re-derive the variant bases from the frozen sha256 rule."""
    m = json.loads((WEBSET7 / "manifest.json").read_text())
    cells: dict[str, list[str]] = {}
    for name, v in m["files"].items():
        assert v.get("gateOk"), f"non-gateOk file in sealed webset: {name}"
        cells.setdefault(v["beard"], []).append(name)
    for cell, n in CELLS.items():
        assert len(cells.get(cell, [])) == n, f"{cell}: {len(cells.get(cell))}"
    bases = []
    for cell, k in (("stubble", 2), ("medium", 2), ("none", 1)):
        bases += sorted(cells[cell],
                        key=lambda x: hashlib.sha256(x.encode()).hexdigest())[:k]
    assert bases == VARIANT_BASES, f"variant bases mismatch: {bases}"


def materials(run_dir: Path) -> list[dict]:
    verify_selection()
    m = json.loads((WEBSET7 / "manifest.json").read_text())
    mats = []
    for name, v in sorted(m["files"].items()):
        layer = {"none": "negative"}.get(v["beard"], v["beard"])
        mats.append({"stem": Path(name).stem, "path": str(WEBSET7 / name),
                     "layer": layer, "kind": "webset"})
    for base in VARIANT_BASES:
        for kind in c6.VARIANT_KINDS:
            stem = f"{Path(base).stem}__{kind}"
            layer = {"none": "negative"}.get(base.split("_")[0],
                                             base.split("_")[0])
            mats.append({"stem": stem,
                         "path": str(run_dir / "variants" / f"{stem}.png"),
                         "layer": layer, "kind": "variant"})
    assert len(mats) == 39 and len({x["stem"] for x in mats}) == 39
    counts: dict[str, int] = {}
    for x in mats:
        x["judged"] = x["layer"] in ("stubble", "medium")
        counts[x["layer"]] = counts.get(x["layer"], 0) + 1
    assert counts == {"stubble": 13, "medium": 15, "negative": 11}
    return mats


# Patch cp6's module-level material/selection hooks so its frozen commands
# (manifest/variants/arm-driver/worktree) operate on the ⑦ set unchanged.
def _bind_cp6() -> None:
    c6.verify_selection = verify_selection
    c6.materials = materials
    c6.ARM_A_COMMIT = ARM_A_COMMIT
    c6.ARM_B_COMMIT = ARM_B_COMMIT


def cmd_freeze_info(args) -> int:
    _bind_cp6()
    weights = c6.LAB / "external" / "models" / "big-lama" / "big-lama.pt"
    wsha = c6.sha256_file(weights)
    assert wsha == WEIGHTS_SHA256
    for arm, commit in (("A", ARM_A_COMMIT), ("B", ARM_B_COMMIT)):
        subprocess.run(["git", "-C", str(REPO), "cat-file", "-e", commit],
                       check=True)
    freeze = subprocess.run([str(c6.VENV_PY), "-m", "pip", "freeze"],
                            capture_output=True, text=True, check=True).stdout
    venv_sha = hashlib.sha256(
        "\n".join(sorted(freeze.strip().splitlines())).encode()).hexdigest()
    verify_selection()
    env = {"recordedAt": c6.now(),
           "armA": {"commit": ARM_A_COMMIT, "weightsSha256": wsha},
           "armB": {"commit": ARM_B_COMMIT, "weightsSha256": wsha},
           "venvPipFreezeSha256": venv_sha, "python": sys.version.split()[0]}
    run_dir = Path(args.run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "environment.json").write_text(json.dumps(env, indent=2) + "\n")
    (run_dir / "pip_freeze.txt").write_text(freeze)
    print(json.dumps(env, indent=2))
    return 0


def cmd_manifest(args) -> int:
    _bind_cp6()
    run_dir = Path(args.run_dir)
    out = run_dir / "image_manifest.json"
    if out.exists():
        raise SystemExit(f"{out} exists — 재료 교체 불가 (§6-2)")
    run_dir.mkdir(parents=True, exist_ok=True)
    sources = {}
    for x in materials(run_dir):
        if x["kind"] == "variant":
            continue
        p = Path(x["path"])
        sources[x["stem"]] = {"file": p.name, "layer": x["layer"],
                              "kind": "webset", "bytes": p.stat().st_size,
                              "sha256": c6.sha256_file(p)}
    assert len(sources) == 24
    out.write_text(json.dumps(
        {"protocol": "docs/beard-simulation/CHECKPOINT7_PROTOCOL.md",
         "sealedAt": c6.now(), "sources": sources,
         "variants": "pending — §6-3 build only"},
        indent=2, ensure_ascii=False) + "\n")
    print(f"sealed 24 sources -> {out}")
    return 0


def cmd_variants(args) -> int:
    _bind_cp6()
    run_dir = Path(args.run_dir)
    vdir = run_dir / "variants"
    if vdir.exists():
        raise SystemExit(f"{vdir} exists — 규율 8")
    c6._verify_manifest(run_dir, want_variants=False)
    bases = [str(WEBSET7 / b) for b in VARIANT_BASES]
    subprocess.run([str(c6.VENV_PY),
                    str(c6.WEBSET / "make_filter_variants.py"),
                    "--checkpoint-build", "--out", str(vdir)] + bases,
                   check=True)
    man_path = run_dir / "image_manifest.json"
    man = json.loads(man_path.read_text())
    variants = {}
    for x in materials(run_dir):
        if x["kind"] != "variant":
            continue
        p = Path(x["path"])
        assert p.exists(), f"variant not generated: {p}"
        variants[x["stem"]] = {"file": p.name, "layer": x["layer"],
                               "kind": "variant", "bytes": p.stat().st_size,
                               "sha256": c6.sha256_file(p)}
    man["variants"] = variants
    man["variantsSealedAt"] = c6.now()
    man_path.write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n")
    print(f"sealed 15 variants -> {man_path}")
    return 0


def cmd_panel(args) -> int:
    import cv2
    import numpy as np
    _bind_cp6()
    run_dir = Path(args.run_dir)
    panels = run_dir / "panels"
    if panels.exists():
        raise SystemExit(f"{panels} exists — 규율 8")
    c6._verify_manifest(run_dir, want_variants=True)
    mats = materials(run_dir)

    wt_root = Path(args.worktree_root)
    labs = {"A": c6._ensure_worktree(wt_root, "cp7armA", ARM_A_COMMIT),
            "B": c6._ensure_worktree(wt_root, "cp7armB", ARM_B_COMMIT)}
    photolist = run_dir / "photolist.json"
    photolist.write_text(json.dumps(mats, indent=2))

    env = {**os.environ, "OMP_NUM_THREADS": "4", "MKL_NUM_THREADS": "4"}
    for arm, wt_lab in labs.items():
        arm_out = run_dir / f"arm{arm}"
        with open(run_dir / f"arm{arm}_driver.log", "w") as lf:
            subprocess.run([str(c6.VENV_PY),
                            str(SPIKE / "checkpoint6.py"), "arm-driver",
                            "--lab", str(wt_lab), "--photos", str(photolist),
                            "--out", str(arm_out)],
                           stdout=lf, stderr=subprocess.STDOUT,
                           env=env, check=True)
        print(f"arm {arm} done")

    reports = {a: json.loads((run_dir / f"arm{a}" / "driver_report.json"
                              ).read_text()) for a in "AB"}
    for x in mats:
        ba = reports["A"]["photos"][x["stem"]].get("bbox")
        bb = reports["B"]["photos"][x["stem"]].get("bbox")
        assert ba == bb, f"{x['stem']}: bbox differs {ba} vs {bb}"

    # §0-1: RAW FILL tiles — a produced fill is shown regardless of the
    # quality-gate verdict; ABSTAIN only when no fill exists; no-op -> ORIG.
    salt = secrets.token_hex(16)
    panels.mkdir()
    mapping, sides_public = {}, {}
    for x in sorted((m for m in mats if m["judged"]), key=lambda m: m["stem"]):
        s = x["stem"]
        a_left = int(hashlib.sha256(f"{salt}:{s}".encode()).hexdigest()[0],
                     16) % 2 == 0
        order = ["A", "B"] if a_left else ["B", "A"]
        orig = cv2.imread(str(run_dir / "armB" / f"{s}_crop_orig.png"),
                          cv2.IMREAD_COLOR)
        assert orig is not None, f"{s}: missing crop orig"
        tiles = [c6._tile(orig, "ORIG", orig.shape)]
        for arm, letter in zip(order, ("L", "R")):
            st = reports[arm]["photos"][s]["status"]
            rp = run_dir / f"arm{arm}" / f"{s}_result.png"
            img = None
            if rp.exists():                 # raw fill (any gate verdict)
                img = cv2.imread(str(rp), cv2.IMREAD_COLOR)
                kind = "fill"
            elif st == "noop":
                img, kind = orig, "noop"
            else:
                kind = "abstain"
            tiles.append(c6._tile(img, letter, orig.shape))
            sides_public.setdefault(s, {})[letter] = kind
        cv2.imwrite(str(panels / f"{s}.png"), np.hstack(tiles))
        mapping[s] = {"L": order[0], "R": order[1]}

    sealed = run_dir / "blind_mapping.sealed.json"
    sealed.write_text(json.dumps(
        {"salt": salt, "createdAt": c6.now(), "mapping": mapping}, indent=2))
    os.chmod(sealed, 0o400)

    form = ["# 체크포인트 ⑦ 판정표 (§4 — 항목별 1회, 재판정 금지)", "",
            "각 패널 [ORIG | L | R]. 타일은 원시 채움(품질 게이트와 무관) —",
            "ABSTAIN = 채움 미생산. 비교 3항목(좌/우/tie) + 팔별 usable/anatomy.", ""]
    for k in ITEMS:
        form.append(f"- {c6.ITEM_LABELS[k]}")
    form += ["- usable(팔별): 제모 시뮬레이션 결과로 사용자에게 보여줄 수 있으면 O",
             "- anatomy 훼손(팔별): 구조 변형(제2입/콧구멍 소실/턱선 붕괴)이면 O", "",
             "| 사진 | 층 | ① | ② | ③ | usable L | usable R | anatomy L | anatomy R | 메모 |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    template = {}
    for x in sorted((m for m in mats if m["judged"]), key=lambda m: m["stem"]):
        form.append(f"| {x['stem']} | {x['layer']} |  |  |  |  |  |  |  |  |")
        template[x["stem"]] = {"item1": "", "item2": "", "item3": "",
                               "usableL": False, "usableR": False,
                               "anatomyL": False, "anatomyR": False,
                               "note": ""}
    (run_dir / "judgment_form.md").write_text("\n".join(form) + "\n")
    (run_dir / "judgments.template.json").write_text(
        json.dumps(template, indent=2, ensure_ascii=False) + "\n")
    (run_dir / "build_report.json").write_text(json.dumps(
        {"builtAt": c6.now(), "sidesPublic": sides_public,
         "panelCount": len(mapping)}, indent=2))
    for a in "AB":
        os.chmod(run_dir / f"arm{a}", 0o000)
    for lg in ("armA_driver.log", "armB_driver.log"):
        os.chmod(run_dir / lg, 0o000)
    print(f"panels: {len(mapping)} -> {panels}\nmapping sealed; arm dirs+logs "
          "chmod 000 — 판정 완료 전 열람 = §7 소진")
    return 0


def cmd_unseal(args) -> int:
    _bind_cp6()
    run_dir = Path(args.run_dir)
    for a in "AB":
        d = run_dir / f"arm{a}"
        if d.exists():
            os.chmod(d, 0o700)
    for lg in ("armA_driver.log", "armB_driver.log"):
        p = run_dir / lg
        if p.exists():
            os.chmod(p, 0o600)
    sealed_path = run_dir / "blind_mapping.sealed.json"
    os.chmod(sealed_path, stat.S_IRUSR | stat.S_IWUSR)
    mapping = json.loads(sealed_path.read_text())["mapping"]
    judgments = json.loads(Path(args.judgments).read_text())
    reports = {a: json.loads((run_dir / f"arm{a}" / "driver_report.json"
                              ).read_text())["photos"] for a in "AB"}
    mats = materials(run_dir)
    by_stem = {x["stem"]: x for x in mats}

    for s in mapping:
        j = judgments.get(s)
        assert j, f"판정 누락: {s}"
        for k in ITEMS:
            assert j.get(k) in ("L", "R", "tie"), f"{s}.{k}={j.get(k)!r}"

    def side_of(s, arm):
        return "L" if mapping[s]["L"] == arm else "R"

    rows = []
    for s in sorted(mapping):
        j = judgments[s]
        fill_b = (run_dir / "armB" / f"{s}_result.png").exists()
        fill_a = (run_dir / "armA" / f"{s}_result.png").exists()
        items = {k: ("tie" if j[k] == "tie" else mapping[s][j[k]])
                 for k in ITEMS}
        rows.append({
            "stem": s, "layer": by_stem[s]["layer"],
            "kind": by_stem[s]["kind"],
            "fillA": fill_a, "fillB": fill_b,
            "verdictA": (reports["A"][s].get("rec") or {}).get("verdict"),
            "verdictB": (reports["B"][s].get("rec") or {}).get("verdict"),
            "items": items,
            "aWins": sum(1 for v in items.values() if v == "A"),
            "usableB": bool(j.get("usable" + side_of(s, "B"))) and fill_b,
            "usableA": bool(j.get("usable" + side_of(s, "A"))) and fill_a,
            "anatomyB": bool(j.get("anatomy" + side_of(s, "B"))),
            "anatomyA": bool(j.get("anatomy" + side_of(s, "A"))),
            "note": j.get("note", ""),
        })

    k: dict = {}
    negs = [x["stem"] for x in mats if x["layer"] == "negative"]
    # K1 — negative serving accidents (verdict==pass would be served).
    k1_rows = [{"stem": s, "status": reports["B"][s]["status"],
                "verdict": (reports["B"][s].get("rec") or {}).get("verdict")}
               for s in negs]
    accidents = [r["stem"] for r in k1_rows if r["status"] == "served"]
    k["K1"] = {"pass": not accidents, "raw": f"사고 {len(accidents)}/11",
               "rows": k1_rows}
    # K2 — anatomy 0 over B fills that exist.
    with_fill = [r for r in rows if r["fillB"]]
    bad = [r["stem"] for r in with_fill if r["anatomyB"]]
    k["K2"] = {"pass": not bad,
               "raw": f"훼손 {len(bad)}/{len(with_fill)} (채움 없음 {28-len(with_fill)} 제외)",
               "photos": bad}
    # K3/K4 — absolute usability of B fills.
    for key, (layer, bar, den) in GATES.items():
        rs = [r for r in rows if r["layer"] == layer]
        n = sum(1 for r in rs if r["usableB"])
        assert len(rs) == den
        k[key] = {"pass": n >= bar, "raw": f"usable {n}/{den} (합격선 {bar})",
                  "usable": [r["stem"] for r in rs if r["usableB"]]}
    # K5 — fill production rate.
    n5 = sum(1 for r in rows if r["fillB"])
    k["K5"] = {"pass": n5 >= K5_MIN, "raw": f"채움 생산 {n5}/{K5_DEN} (합격선 {K5_MIN})"}
    overall = all(k[x]["pass"] for x in ("K1", "K2", "K3", "K4", "K5"))

    r1 = {"aWinPhotos": [r["stem"] for r in rows if r["aWins"] > 0],
          "usableA": sum(1 for r in rows if r["usableA"])}
    r2 = {"passUsable": 0, "passNot": 0, "abstainUsable": 0, "abstainNot": 0,
          "hardfailUsable": 0, "hardfailNot": 0}
    for r in with_fill:
        v = {"pass": "pass", "abstain": "abstain",
             "hard-fail": "hardfail"}.get(r["verdictB"] or "abstain",
                                          "abstain")
        r2[v + ("Usable" if r["usableB"] else "Not")] += 1
    r3 = []
    for r in rows:
        if r["kind"] != "variant":
            continue
        base = r["stem"].split("__")[0]
        brow = next((x for x in rows if x["stem"] == base), None)
        r3.append({"variant": r["stem"], "usableB": r["usableB"],
                   "baseUsableB": brow["usableB"] if brow else None})
    r4 = [{"stem": s, "status": reports["A"][s]["status"]} for s in negs]

    verdict = {"finishedAt": c6.now(), "overallPass": overall, "gates": k,
               "R1_regression": r1, "R2_gateVsHuman": r2,
               "R3_variants": r3, "R4_armA_negatives": r4, "rows": rows}
    (run_dir / "verdict.json").write_text(
        json.dumps(verdict, indent=2, ensure_ascii=False, default=str) + "\n")
    lines = [f"# 체크포인트 ⑦ 결과 ({c6.now()})", "",
             f"**종합: {'합격 — B(게이트 수리본) 승격' if overall else '불합격 (§8 해석 참조)'}**",
             "", "| 게이트 | 원자료 | 판정 |", "|---|---|---|"]
    for key in ("K1", "K2", "K3", "K4", "K5"):
        lines.append(f"| {key} | {k[key]['raw']} | "
                     f"{'PASS' if k[key]['pass'] else 'FAIL'} |")
    lines += ["", f"R1 A승 사진: {len(r1['aWinPhotos'])} · R2 게이트-인간 교차: "
              f"{json.dumps(r2)}"]
    (run_dir / "verdict_report.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({x: {"pass": k[x]["pass"], "raw": k[x]["raw"]}
                      for x in ("K1", "K2", "K3", "K4", "K5")},
                     ensure_ascii=False, indent=2))
    print(f"\noverall: {'PASS' if overall else 'FAIL'} -> "
          f"{run_dir / 'verdict_report.md'}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run-dir", default=str(RUN_DIR))
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("freeze-info")
    sub.add_parser("manifest")
    sub.add_parser("variants")
    p = sub.add_parser("panel")
    p.add_argument("--worktree-root", required=True)
    u = sub.add_parser("unseal")
    u.add_argument("--judgments", required=True)
    args = ap.parse_args()
    return {"freeze-info": cmd_freeze_info, "manifest": cmd_manifest,
            "variants": cmd_variants, "panel": cmd_panel,
            "unseal": cmd_unseal}[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
