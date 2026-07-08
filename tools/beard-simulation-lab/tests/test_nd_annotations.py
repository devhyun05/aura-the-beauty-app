"""ND facial-hair annotation loader — runs only when the external data exists
(tools/beard-simulation-lab/external/, gitignored, research-only license)."""

import numpy as np
import pytest

from engine.nd_annotations import (
    default_annotations_root,
    list_annotation_ids,
    load_annotation,
    to_engine_channels,
)

ROOT = default_annotations_root()
IDS = list_annotation_ids(ROOT)

pytestmark = pytest.mark.skipif(
    not IDS, reason="ND facial_hair_annotations not present in external/"
)


def test_dataset_scale() -> None:
    assert len(IDS) >= 2000


def test_load_decodes_per_folder_palette() -> None:
    # Take the first few ids and confirm every declared class yields pixels.
    checked = 0
    for image_id in IDS[:5]:
        masks = load_annotation(image_id, ROOT)
        assert masks, f"{image_id}: no classes decoded"
        for name, mask in masks.items():
            assert mask.shape == (1024, 1024)
            assert mask.sum() > 0, f"{image_id}/{name}: declared but empty"
            checked += 1
    assert checked > 0


def test_engine_channel_mapping() -> None:
    for image_id in IDS[:20]:
        masks = load_annotation(image_id, ROOT)
        channels = to_engine_channels(masks)
        union = np.maximum(channels["hard"], channels["shadow"])
        declared = np.maximum.reduce(list(masks.values()))
        assert np.array_equal(union > 0, declared > 0)
