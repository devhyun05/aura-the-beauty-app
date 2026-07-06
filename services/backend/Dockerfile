FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY services/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

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
