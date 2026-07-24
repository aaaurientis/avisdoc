# Service de génération documentaire AvisDoc.
# Python (WeasyPrint, python-pptx) + Node (pptxgenjs) + polices, = le pack.
FROM python:3.11-slim

# --- Dépendances système : WeasyPrint (Pango/Cairo/FFI) + Node + polices ------
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
      libffi8 libcairo2 libjpeg62-turbo shared-mime-info \
      fonts-liberation \
      nodejs npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dépendances Python -------------------------------------------------------
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Dépendance Node (pptxgenjs), résolue via NODE_PATH -----------------------
RUN npm install pptxgenjs@3.12.0 --no-save --prefix /app
ENV NODE_PATH=/app/node_modules

# --- Application + pack vendorisé ---------------------------------------------
COPY sb.py generator.py app.py ./
COPY paquet ./paquet

# Sanity check du pack à la construction de l'image (doit passer, cf. brief).
RUN cd paquet && python build.py controles

ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
