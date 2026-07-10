"""A small U-Net for beard-zone segmentation. Pure torch, ~2M params.

Deliberately tiny: the training set is ~2k crops, the task is a single
foreground zone, and it must run on an M-series MPS in minutes. Depth 4 with
16 base channels. No external weights -- trained from scratch, so no license
entanglement (lab/research-only regardless, matching the ND data terms).
"""

from __future__ import annotations

import torch
import torch.nn as nn


class _DoubleConv(nn.Module):
    def __init__(self, cin: int, cout: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(cin, cout, 3, padding=1, bias=False),
            nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
            nn.Conv2d(cout, cout, 3, padding=1, bias=False),
            nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class UNet(nn.Module):
    def __init__(self, base: int = 16) -> None:
        super().__init__()
        b = base
        self.d1 = _DoubleConv(3, b)
        self.d2 = _DoubleConv(b, b * 2)
        self.d3 = _DoubleConv(b * 2, b * 4)
        self.d4 = _DoubleConv(b * 4, b * 8)
        self.pool = nn.MaxPool2d(2)
        self.bott = _DoubleConv(b * 8, b * 16)
        self.up4 = nn.ConvTranspose2d(b * 16, b * 8, 2, stride=2)
        self.u4 = _DoubleConv(b * 16, b * 8)
        self.up3 = nn.ConvTranspose2d(b * 8, b * 4, 2, stride=2)
        self.u3 = _DoubleConv(b * 8, b * 4)
        self.up2 = nn.ConvTranspose2d(b * 4, b * 2, 2, stride=2)
        self.u2 = _DoubleConv(b * 4, b * 2)
        self.up1 = nn.ConvTranspose2d(b * 2, b, 2, stride=2)
        self.u1 = _DoubleConv(b * 2, b)
        self.head = nn.Conv2d(b, 1, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        c1 = self.d1(x)
        c2 = self.d2(self.pool(c1))
        c3 = self.d3(self.pool(c2))
        c4 = self.d4(self.pool(c3))
        z = self.bott(self.pool(c4))
        z = self.u4(torch.cat([self.up4(z), c4], 1))
        z = self.u3(torch.cat([self.up3(z), c3], 1))
        z = self.u2(torch.cat([self.up2(z), c2], 1))
        z = self.u1(torch.cat([self.up1(z), c1], 1))
        return self.head(z)  # logits (N,1,H,W)


def param_count(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())
