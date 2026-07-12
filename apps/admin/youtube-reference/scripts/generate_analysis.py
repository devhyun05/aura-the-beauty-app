#!/usr/bin/env python3
"""Generate analysis-data.js from public YouTube metadata.

This script intentionally uses only Python's standard library so teammates can
run it without npm/pip setup. Transcript support is best-effort because YouTube
caption endpoints can return empty bodies even when a caption track is listed.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


USER_AGENT = "Mozilla/5.0 (AURA YouTube reference analyzer)"


def fetch_text(url: str) -> str:
  request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
  with urllib.request.urlopen(request, timeout=25) as response:
    return response.read().decode("utf-8", "ignore")


def video_id_from(value: str) -> str:
  if re.fullmatch(r"[\w-]{11}", value):
    return value

  parsed = urllib.parse.urlparse(value)
  if parsed.hostname in {"youtu.be", "www.youtu.be"}:
    return parsed.path.strip("/")

  query = urllib.parse.parse_qs(parsed.query)
  if query.get("v"):
    return query["v"][0]

  raise ValueError(f"Cannot extract YouTube video id from: {value}")


def extract_json_assignment(page: str, name: str) -> dict[str, Any]:
  match = re.search(rf"{re.escape(name)}\s*=\s*(\{{.*?\}});", page)
  if not match:
    return {}
  return json.loads(match.group(1))


def fetch_oembed(video_id: str) -> dict[str, Any]:
  url = "https://www.youtube.com/oembed?" + urllib.parse.urlencode(
    {"url": f"https://youtu.be/{video_id}", "format": "json"},
  )
  return json.loads(fetch_text(url))


def caption_tracks_from_page(page: str) -> list[dict[str, Any]]:
  match = re.search(r'"captionTracks":(\[.*?\])', page)
  if not match:
    return []
  try:
    return json.loads(match.group(1))
  except json.JSONDecodeError:
    return []


def parse_caption_json(raw: str) -> list[dict[str, Any]]:
  data = json.loads(raw)
  rows: list[dict[str, Any]] = []
  for event in data.get("events", []):
    text = "".join(segment.get("utf8", "") for segment in event.get("segs", [])).strip()
    if text:
      rows.append({"start": event.get("tStartMs", 0) / 1000, "text": text})
  return rows


def parse_caption_xml(raw: str) -> list[dict[str, Any]]:
  root = ET.fromstring(raw)
  rows: list[dict[str, Any]] = []
  for node in root.iter("text"):
    text = html.unescape("".join(node.itertext()).strip())
    if text:
      rows.append({"start": float(node.attrib.get("start", 0)), "text": text})
  return rows


def fetch_transcript(tracks: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], str]:
  if not tracks:
    return [], "caption track not found"

  track = next((item for item in tracks if item.get("languageCode") == "ko"), tracks[0])
  base_url = track.get("baseUrl")
  if not base_url:
    return [], "caption baseUrl missing"

  for suffix in ("&fmt=json3", "", "&fmt=srv3"):
    raw = fetch_text(base_url + suffix)
    if not raw.strip():
      continue
    try:
      if raw.lstrip().startswith("{"):
        rows = parse_caption_json(raw)
      else:
        rows = parse_caption_xml(raw)
      if rows:
        return rows, f"caption fetched: {track.get('languageCode', 'unknown')}"
    except (json.JSONDecodeError, ET.ParseError, ValueError):
      continue

  return [], "caption track found but body was empty"


def format_duration(seconds: int) -> str:
  hours, remainder = divmod(seconds, 3600)
  minutes, seconds = divmod(remainder, 60)
  if hours:
    return f"{hours}:{minutes:02d}:{seconds:02d}"
  return f"{minutes:02d}:{seconds:02d}"


def build_analysis(video_id: str, oembed: dict[str, Any], player: dict[str, Any], transcript: list[dict[str, Any]], transcript_status: str) -> dict[str, Any]:
  details = player.get("videoDetails", {})
  title = details.get("title") or oembed.get("title") or f"YouTube video {video_id}"
  channel = details.get("author") or oembed.get("author_name") or ""
  description = details.get("shortDescription") or ""
  duration_seconds = int(details.get("lengthSeconds") or 0)
  duration = format_duration(duration_seconds) if duration_seconds else ""

  transcript_note = (
    f"transcript {len(transcript)} segments fetched"
    if transcript
    else f"transcript unavailable: {transcript_status}"
  )
  source_assumption = (
    f"자동 분석은 YouTube metadata와 영상 설명을 근거로 생성했습니다. {transcript_note}. "
    "전문 발화와 실제 장면 타임코드는 팀 시청 중 검증해야 합니다."
  )

  return {
    "generatedAt": "",
    "source": {
      "method": "YouTube oEmbed + watch metadata + best-effort captions",
      "transcript": transcript_note,
    },
    "metadata": {
      "videoId": video_id,
      "url": f"https://youtu.be/{video_id}",
      "title": title,
      "channel": channel,
      "authorUrl": oembed.get("author_url", ""),
      "duration": duration,
      "durationSeconds": duration_seconds,
      "status": "auto_metadata" if not transcript else "auto_transcript",
      "thumbnailUrl": oembed.get("thumbnail_url", ""),
      "description": description,
      "assumption": source_assumption,
    },
    "notes": {
      "overviewPurpose": (
        f"자동 수집 결과: 이 영상의 제목은 '{title}'이고 채널은 '{channel}'입니다.\n\n"
        f"영상 설명:\n{description}\n\n"
        "우리 발표 적용 목적: 이 영상의 문제 정의, 서비스 가치 설명, 제품/디자인 의사결정 제시 방식을 "
        "AURA 최종 발표의 도입, 데모 연결, 마무리 메시지에 반영합니다."
      ),
      "designInsights": (
        "자동 분석 초안\n"
        "- 제목/설명에서 드러나는 핵심 변화 문장을 첫 화면의 디자인 축으로 삼습니다.\n"
        "- 화면은 기능 목록보다 사용자가 겪는 애매함과 제품이 줄이는 판단 비용을 보여줘야 합니다.\n"
        "- 실제 색, 레이아웃, 전환 리듬은 영상 시청 중 타임코드로 검증합니다."
      ),
      "deliveryAnalysis": (
        "자동 분석 초안\n"
        "- 발표는 서비스/기능 소개보다 사용자 언어의 문제 문장으로 시작하는 편이 좋습니다.\n"
        "- 대본은 '왜 중요한가 -> 어떤 방향으로 바뀌는가 -> 어떤 결정이 있었나 -> 무엇을 기억해야 하나' 순서로 정리합니다.\n"
        "- transcript가 확보되면 실제 반복 표현과 전환 문장을 추가 분석합니다."
      ),
      "structureAnalysis": (
        "자동 분석 초안\n"
        "1. Hook: 제목과 설명의 핵심 문제를 청중 언어로 고정합니다.\n"
        "2. Context: 기존 서비스 가치와 변화 필요성을 설명합니다.\n"
        "3. Direction: 앞으로의 제품/커뮤니티 방향을 제안합니다.\n"
        "4. Evidence: 디자인 의사결정, 사례, 데모 화면으로 설득합니다.\n"
        "5. Close: 심사자가 기억할 미래상 한 문장으로 닫습니다."
      ),
      "discussionNotes": (
        "자동 분석 기반 토의 질문\n"
        "- 우리 발표의 첫 문제 문장은 무엇인가?\n"
        "- 기능 설명 전에 합의해야 할 사용자 가치는 무엇인가?\n"
        "- 마지막 슬라이드에서 심사자가 기억해야 할 한 문장은 무엇인가?"
      ),
    },
    "transcript": "\n".join(f"{int(row['start'] // 60):02d}:{int(row['start'] % 60):02d} {row['text']}" for row in transcript[:400]),
    "timecodes": [
      {
        "id": "auto-opening",
        "time": "00:00",
        "title": "[자동 초안] 오프닝/문제 문장 확인",
        "evidence": "자동 metadata 기반: 제목과 영상 설명의 핵심 문제를 어떻게 도입하는지 확인",
        "apply": "AURA 발표 첫 30초도 사용자 문제를 한 문장으로 고정",
        "verified": False,
      },
      {
        "id": "auto-context",
        "time": "04:00",
        "title": "[자동 초안] 서비스 가치/맥락",
        "evidence": "자동 metadata 기반: 기존 가치와 변화 필요성을 설명하는 구간 확인",
        "apply": "기능 전에 AURA가 지키려는 사용자 가치를 말하기",
        "verified": False,
      },
      {
        "id": "auto-design",
        "time": "18:00",
        "title": "[자동 초안] 디자인/제품 의사결정",
        "evidence": "자동 metadata 기반: 디자인 결정의 근거와 제약을 확인",
        "apply": "데모 화면마다 왜 그렇게 설계했는지 사용자 관점으로 설명",
        "verified": False,
      },
      {
        "id": "auto-close",
        "time": "36:00",
        "title": "[자동 초안] 마무리 메시지",
        "evidence": "자동 metadata 기반: 기억할 미래상이나 결론 문장을 확인",
        "apply": "마지막 슬라이드는 기능 목록 대신 AURA가 만드는 변화로 마감",
        "verified": False,
      },
    ],
    "actions": [
      {
        "id": "auto-act-hook",
        "label": "[자동 분석] 첫 슬라이드에 사용자 문제 문장을 넣는다.",
        "owner": "발표/기획",
        "done": False,
      },
      {
        "id": "auto-act-demo",
        "label": "[자동 분석] 데모 화면마다 줄이는 사용자 불확실성을 한 줄로 붙인다.",
        "owner": "디자인/개발",
        "done": False,
      },
      {
        "id": "auto-act-close",
        "label": "[자동 분석] 마지막 슬라이드 문장을 사용자 변화 중심으로 다시 쓴다.",
        "owner": "발표자",
        "done": False,
      },
    ],
  }


def main() -> int:
  parser = argparse.ArgumentParser()
  parser.add_argument("video", help="YouTube URL or 11-character video id")
  parser.add_argument("--out", default="analysis-data.js", help="Output JS path")
  args = parser.parse_args()

  video_id = video_id_from(args.video)
  oembed = fetch_oembed(video_id)
  page = fetch_text(f"https://www.youtube.com/watch?v={video_id}")
  player = extract_json_assignment(page, "ytInitialPlayerResponse")
  tracks = caption_tracks_from_page(page)
  transcript, transcript_status = fetch_transcript(tracks)
  analysis = build_analysis(video_id, oembed, player, transcript, transcript_status)
  analysis["generatedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()

  payload = "window.AURA_YOUTUBE_REFERENCE_ANALYSIS = "
  payload += json.dumps(analysis, ensure_ascii=False, indent=2)
  payload += ";\n"
  Path(args.out).write_text(payload, encoding="utf-8")
  print(f"wrote {args.out}")
  print(f"title: {analysis['metadata']['title']}")
  print(f"transcript: {analysis['source']['transcript']}")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
