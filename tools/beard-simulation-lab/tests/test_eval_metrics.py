"""Tests for the ruler, not the thing being measured.

Every bug that actually cost time this session lived in the measurement code:
a sweep that divided by `gt & keep` (so a stingier keep flattered its own
recall), a `raw` scope that was silently confined to the crop box, bands that
dropped 15% of the ground truth, and an overlay that declared "orange" while
writing blue. The engine was fine. The ruler was not.

These pin the ruler against cases whose answers are known by construction.
"""

from __future__ import annotations

import numpy as np
import pytest

from eval.bands import band_recall
from eval.gt_region import region_from_strands
from eval.run_owndomain_eval import _score, discover_holdout_pairs, discover_pairs


def _rect(shape, y0, y1, x0, x1) -> np.ndarray:
    m = np.zeros(shape, dtype=bool)
    m[y0:y1, x0:x1] = True
    return m


SHAPE = (100, 100)


def test_score_on_a_known_overlap() -> None:
    # gt = 40x40 = 1600 px, pred shifted by 20 => intersection 20x40 = 800.
    gt = _rect(SHAPE, 10, 50, 10, 50)
    pred = _rect(SHAPE, 10, 50, 30, 70)
    s = _score(pred, gt)
    assert s["recall"] == pytest.approx(800 / 1600)
    assert s["precision"] == pytest.approx(800 / 1600)
    assert s["iou"] == pytest.approx(800 / (1600 + 1600 - 800))


def test_score_perfect_and_disjoint() -> None:
    gt = _rect(SHAPE, 0, 10, 0, 10)
    assert _score(gt.copy(), gt) == {"iou": 1.0, "precision": 1.0, "recall": 1.0}
    disjoint = _rect(SHAPE, 50, 60, 50, 60)
    s = _score(disjoint, gt)
    assert (s["iou"], s["precision"], s["recall"]) == (0.0, 0.0, 0.0)


def test_score_empty_denominators_are_none_not_zero() -> None:
    """0.0 would drag every average down; the metric is undefined, not bad."""
    gt = _rect(SHAPE, 0, 10, 0, 10)
    empty = np.zeros(SHAPE, dtype=bool)
    assert _score(empty, gt)["precision"] is None       # nothing predicted
    assert _score(gt.copy(), empty)["recall"] is None   # no ground truth
    assert _score(empty, empty)["iou"] is None


def test_recall_denominator_ignores_the_prediction_scope() -> None:
    """The bug that made Stage 1 look like a regression.

    Shrinking the region a model may predict in must LOWER its recall, never
    raise it. It raises it only if you also shrink the ground truth by the same
    mask -- i.e. score against `gt & keep`, moving the goalposts.
    """
    gt = _rect(SHAPE, 0, 100, 0, 100)          # ground truth everywhere
    pred = _rect(SHAPE, 0, 50, 0, 100)         # model finds the top half
    wide = _score(pred, gt)

    keep = _rect(SHAPE, 0, 50, 0, 100)         # a keep mask hiding the bottom half
    honest = _score(pred & keep, gt)           # full GT denominator
    cheating = _score(pred & keep, gt & keep)  # denominator moved with the scope

    assert honest["recall"] == pytest.approx(wide["recall"])  # scope changed nothing found
    assert cheating["recall"] == pytest.approx(1.0)           # flattered to perfection
    assert cheating["recall"] > honest["recall"]


def test_bands_expose_ground_truth_that_falls_in_no_band() -> None:
    """`unassigned` is the invariant that caught a real band-definition bug."""
    gt = _rect(SHAPE, 0, 100, 0, 20)           # 2000 px, half of it below y=50
    bands = {"top": _rect(SHAPE, 0, 50, 0, 100)}   # covers only the upper half
    out = band_recall(gt, np.zeros(SHAPE, dtype=bool), bands)

    assert out["unassigned"]["gtPixels"] == 1000
    assert out["unassigned"]["pctOfGt"] == pytest.approx(50.0)


def test_bands_recall_and_precision_are_computed_within_the_band() -> None:
    gt = _rect(SHAPE, 0, 20, 0, 100)               # 2000 px, all inside `top`
    pred = _rect(SHAPE, 0, 20, 0, 50) | _rect(SHAPE, 20, 40, 0, 50)
    bands = {"top": _rect(SHAPE, 0, 20, 0, 100)}

    out = band_recall(gt, pred, bands)["top"]
    assert out["gtPixels"] == 2000
    assert out["recall"] == pytest.approx(1000 / 2000)     # half the GT hit
    assert out["precision"] == pytest.approx(1000 / 1000)  # in-band pred is all correct
    # The out-of-band half of `pred` must not touch the band's precision.


def test_band_metrics_are_none_when_the_band_is_empty() -> None:
    gt = _rect(SHAPE, 0, 10, 0, 10)
    bands = {"elsewhere": _rect(SHAPE, 80, 90, 80, 90)}
    out = band_recall(gt, np.zeros(SHAPE, dtype=bool), bands)["elsewhere"]
    assert out["gtPixels"] == 0
    assert out["recall"] is None
    assert out["precision"] is None


# --- REGION ground-truth transform (the approved label standard) ------------

def test_holdout_never_leaks_into_the_tuning_set() -> None:
    """Every Stage 0-4 decision was fitted to the 9 dev photos; the holdout is
    the only unfitted evidence we have. Naming one `pic5.png` would silently
    pull it into discover_pairs() and burn it."""
    dev = {name for name, _, _ in discover_pairs()}
    hold = {name for name, _, _ in discover_holdout_pairs()}
    assert dev.isdisjoint(hold)
    dev_paths = {p.resolve() for _, p, m in discover_pairs() for p in (p, m)}
    hold_paths = {p.resolve() for _, p, m in discover_holdout_pairs() for p in (p, m)}
    assert dev_paths.isdisjoint(hold_paths)


def test_region_fills_the_gap_between_two_nearby_strands() -> None:
    """The whole point of REGION: sparse hairs close into one zone."""
    gt = _rect(SHAPE, 40, 60, 20, 30) | _rect(SHAPE, 40, 60, 40, 50)  # 12px gap
    zone, clipped = region_from_strands(gt, kernel_px=15)
    assert clipped == 0
    # the gap column (x=35) is empty in gt but filled in the zone
    assert not gt[50, 35]
    assert zone[50, 35]
    # and the zone is a superset of the original strands
    assert (zone | gt).sum() == zone.sum()


def test_region_leaves_a_far_isolated_strand_as_its_own_island() -> None:
    """Rule 3: don't bridge across clean skin to a distant stray hair."""
    gt = _rect(SHAPE, 10, 14, 10, 14) | _rect(SHAPE, 80, 84, 80, 84)
    zone, _ = region_from_strands(gt, kernel_px=9)
    assert not zone[47, 47]  # midpoint between the two stays empty


def test_region_clip_above_line_is_counted_not_dropped() -> None:
    """Discipline rule 2: clipped pixels are surfaced, never silently lost."""
    gt = _rect(SHAPE, 10, 90, 40, 60)  # a tall column crossing the line
    zone, clipped = region_from_strands(gt, kernel_px=3, top_y=50)
    assert not zone[:50].any()          # nothing survives above the line
    assert zone[50:].any()              # zone remains below
    assert clipped == int(zone[:50].sum()) + clipped  # tautology guard
    # the count equals the zone pixels that sat above the line before removal
    zone_noclip, _ = region_from_strands(gt, kernel_px=3)
    assert clipped == int(zone_noclip[:50].sum())
