FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libegl1 libgl1 libglib2.0-0 libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY services/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade "pip==26.1.2" "setuptools==83.0.0" "wheel==0.46.3"
RUN pip install --no-cache-dir -r requirements.txt

COPY services/backend/scripts/download_hair_segmenter.py /tmp/download_hair_segmenter.py
RUN python /tmp/download_hair_segmenter.py --output /app/models/hair_segmenter.tflite \
  && rm /tmp/download_hair_segmenter.py

COPY services/backend/scripts/download_face_landmarker.py /tmp/download_face_landmarker.py
RUN python /tmp/download_face_landmarker.py --output /app/models/face_landmarker.task \
  && rm /tmp/download_face_landmarker.py

COPY services/backend/scripts/download_face_detector.py /tmp/download_face_detector.py
RUN python /tmp/download_face_detector.py --output /app/models/blaze_face_short_range.tflite \
  && rm /tmp/download_face_detector.py

COPY services/backend/app ./app
COPY docs/backend/schema.sql ./docs/backend/schema.sql
COPY docs/backend/seed.sql ./docs/backend/seed.sql
# Auradin startup validates the active pointer and every manifest-referenced artifact.
# Keep the immutable catalog, knowledge, manifest, and vector assets in the runtime image.
COPY data/auradin/active_snapshot.json ./data/auradin/active_snapshot.json
COPY data/auradin/catalog ./data/auradin/catalog
COPY data/auradin/knowledge ./data/auradin/knowledge
COPY data/auradin/manifests ./data/auradin/manifests
COPY data/auradin/vector ./data/auradin/vector
ENV AURADIN_DATA_ROOT=/app

RUN adduser --disabled-password --gecos "" appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).read()" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
