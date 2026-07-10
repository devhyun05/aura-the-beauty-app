"""Train the beard-zone U-Net on the ND crop cache. MPS if available, else CPU.

Dice + BCE (foreground is a minority of the crop, so BCE alone under-segments).
Light augmentation (h-flip, brightness/contrast jitter) since the set is small
and the target domain (Korean selfies) differs from ND. Saves the best-val-Dice
checkpoint to outputs/student/unet_best.pt.

The 9 selfies are never in this cache, so val Dice here is in-domain (ND); the
real test is the protocol-v2.1 run on the selfies, done separately.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from train.unet import UNet, param_count  # noqa: E402

LAB = Path(__file__).resolve().parents[1]
CACHE = LAB / "outputs" / "nd_cache"
OUT = LAB / "outputs" / "student"


class NDCrops(Dataset):
    def __init__(self, split: str, augment: bool) -> None:
        self.files = sorted((CACHE / split).glob("*.jpg"))
        self.augment = augment

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, i: int):
        f = self.files[i]
        img = cv2.imread(str(f), cv2.IMREAD_COLOR)
        m = cv2.imread(str(f.with_suffix(".png")), cv2.IMREAD_GRAYSCALE)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        tgt = (m > 127).astype(np.float32)
        if self.augment:
            if np.random.rand() < 0.5:
                img, tgt = img[:, ::-1].copy(), tgt[:, ::-1].copy()
            if np.random.rand() < 0.7:
                g = np.random.uniform(0.8, 1.2)
                b = np.random.uniform(-0.08, 0.08)
                img = np.clip(img * g + b, 0, 1)
        x = torch.from_numpy(img.transpose(2, 0, 1))
        y = torch.from_numpy(tgt[None])
        return x, y


def dice_bce(logits: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
    bce = F.binary_cross_entropy_with_logits(logits, y)
    p = torch.sigmoid(logits)
    num = 2 * (p * y).sum((2, 3)) + 1
    den = p.sum((2, 3)) + y.sum((2, 3)) + 1
    dice = 1 - (num / den).mean()
    return bce + dice


@torch.no_grad()
def val_dice(model, loader, device) -> float:
    model.eval()
    tot, n = 0.0, 0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        p = (torch.sigmoid(model(x)) > 0.5).float()
        num = 2 * (p * y).sum((2, 3))
        den = p.sum((2, 3)) + y.sum((2, 3))
        d = torch.where(den > 0, num / den, torch.ones_like(den))
        tot += float(d.sum())
        n += x.shape[0]
    return tot / max(n, 1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--base", type=int, default=16)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    tr = DataLoader(NDCrops("train", True), batch_size=args.batch, shuffle=True,
                    num_workers=0, drop_last=True)
    va = DataLoader(NDCrops("val", False), batch_size=args.batch, num_workers=0)
    print(f"device={device}  train={len(tr.dataset)}  val={len(va.dataset)}")

    model = UNet(base=args.base).to(device)
    print(f"params={param_count(model)/1e6:.2f}M")
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, args.epochs)

    best = -1.0
    for ep in range(1, args.epochs + 1):
        model.train()
        t0, running = time.time(), 0.0
        for x, y in tr:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            loss = dice_bce(model(x), y)
            loss.backward()
            opt.step()
            running += float(loss) * x.shape[0]
        sched.step()
        vd = val_dice(model, va, device)
        flag = ""
        if vd > best:
            best = vd
            torch.save({"state": model.state_dict(), "base": args.base}, OUT / "unet_best.pt")
            flag = " *saved"
        print(f"ep {ep:3d}  loss {running/len(tr.dataset):.4f}  "
              f"valDice {vd:.4f}  {time.time()-t0:.1f}s{flag}")
    print(f"best valDice {best:.4f} -> {OUT/'unet_best.pt'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
