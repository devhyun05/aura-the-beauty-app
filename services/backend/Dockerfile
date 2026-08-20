FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends libegl1 libgl1 libglib2.0-0 libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY services/backend/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --upgrade \
      pip==26.2.1 \
      setuptools==84.0.0 \
      wheel==0.46.3 \
  && python -m pip install --no-cache-dir -r requirements.txt \
  && python -m pip uninstall -y pip setuptools wheel

COPY services/backend/scripts/download_hair_segmenter.py /tmp/download_hair_segmenter.py
RUN python /tmp/download_hair_segmenter.py --output /app/models/hair_segmenter.tflite \
  && rm /tmp/download_hair_segmenter.py

COPY services/backend/app ./app
COPY docs/backend/schema.sql ./docs/backend/schema.sql
COPY docs/backend/seed.sql ./docs/backend/seed.sql
# Auradin 검색 카탈로그 데이터 — 이게 없으면 배포 백엔드는 빈 카탈로그로 모든 검색이 실패한다.
# 런타임에 실제로 읽는 것만: catalog(시드/mvp) + knowledge(청크). vector 인덱스는 선택
# (없으면 lexical 폴백), detail/raw/processed 등은 빌드타임 산출물이라 제외 → 이미지 경량.
# catalog_loader는 AURADIN_DATA_ROOT 밑에서 data/auradin/**를 읽는다.
COPY data/auradin/catalog ./data/auradin/catalog
COPY data/auradin/knowledge ./data/auradin/knowledge
ENV AURADIN_DATA_ROOT=/app

RUN adduser --disabled-password --gecos "" appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).read()" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
