#!/usr/bin/env bash

set -euo pipefail

KEYCHAIN="${HOME}/Library/Keychains/login.keychain-db"
OUT_BASE="${HOME}/DeveloperIDSetup"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${OUT_BASE}/${TIMESTAMP}"
KEY_FILE="${OUT_DIR}/developer_id_application.key"
CSR_FILE="${OUT_DIR}/developer_id_application.csr"

mkdir -p "${OUT_DIR}"

COMMON_NAME="${APPLE_CERT_COMMON_NAME:-}"
EMAIL="${APPLE_CERT_EMAIL:-}"
CER_FILE="${APPLE_CERT_CER_PATH:-}"
KEY_FILE_OVERRIDE="${APPLE_CERT_KEY_PATH:-}"

# Si le fichier .cer est fourni, on peut sauter la génération CSR
if [[ -z "${CER_FILE}" ]]; then
  if [[ -z "${COMMON_NAME}" ]]; then
    read -r -p "Nom complet (Common Name): " COMMON_NAME
  fi

  if [[ -z "${EMAIL}" ]]; then
    read -r -p "Email Apple Developer: " EMAIL
  fi

  echo
  echo "1) Generation de la cle privee et du CSR..."
  openssl req -new -newkey rsa:2048 -nodes \
    -keyout "${KEY_FILE}" \
    -out "${CSR_FILE}" \
    -subj "/CN=${COMMON_NAME}/emailAddress=${EMAIL}"

  chmod 600 "${KEY_FILE}"

  echo "CSR cree: ${CSR_FILE}"
  echo "Cle privee: ${KEY_FILE}"
  echo
  echo "2) Ouverture de la page Apple Developer (certificats)..."
  open "https://developer.apple.com/account/resources/certificates/list"

  echo
  echo "Actions a faire dans le navigateur:"
  echo "- Create a Certificate"
  echo "- Type: Developer ID Application"
  echo "- Upload CSR: ${CSR_FILE}"
  echo "- Download du certificat .cer"
  echo

  read -r -p "Chemin du .cer (laisser vide pour auto-detect dans ~/Downloads): " CER_FILE
else
  echo "Utilisation du certificat fourni: ${CER_FILE}"
  # Si une clé privée est spécifiée, l'utiliser
  if [[ -n "${KEY_FILE_OVERRIDE}" ]]; then
    KEY_FILE="${KEY_FILE_OVERRIDE}"
  fi
fi

if [[ -z "${CER_FILE}" ]]; then
  echo "Recherche auto du .cer dans ~/Downloads (max 5 min)..."
  START_EPOCH="$(date +%s)"
  for _ in {1..300}; do
    CANDIDATE="$(find "${HOME}/Downloads" -maxdepth 1 -type f -name "*.cer" -print0 \
      | xargs -0 ls -1t 2>/dev/null | head -n 1 || true)"
    if [[ -n "${CANDIDATE}" ]]; then
      FILE_EPOCH="$(stat -f %m "${CANDIDATE}")"
      if (( FILE_EPOCH >= START_EPOCH )); then
        CER_FILE="${CANDIDATE}"
        break
      fi
    fi
    sleep 1
  done
  
  # Si aucun fichier récent trouvé, prendre le plus récent quel que soit son âge
  if [[ -z "${CER_FILE}" ]]; then
    CANDIDATE="$(find "${HOME}/Downloads" -maxdepth 1 -type f -name "*.cer" -print0 \
      | xargs -0 ls -1t 2>/dev/null | head -n 1 || true)"
    if [[ -n "${CANDIDATE}" ]]; then
      CER_FILE="${CANDIDATE}"
    fi
  fi
fi

if [[ -z "${CER_FILE}" ]] || [[ ! -f "${CER_FILE}" ]]; then
  echo "Erreur: fichier .cer introuvable."
  echo "Relance le script avec APPLE_CERT_CER_PATH=/chemin/vers/certificat.cer"
  exit 1
fi

echo
echo "3) Import du certificat dans le trousseau login..."
if [[ -n "${KEY_FILE_OVERRIDE}" && -f "${KEY_FILE_OVERRIDE}" ]]; then
  echo "Import de la cle privee..."
  security import "${KEY_FILE_OVERRIDE}" -k "${KEYCHAIN}" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
elif [[ -f "${KEY_FILE}" ]]; then
  echo "Import de la cle privee..."
  security import "${KEY_FILE}" -k "${KEYCHAIN}" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
fi
echo "Import du certificat..."
security import "${CER_FILE}" -k "${KEYCHAIN}" -T /usr/bin/codesign -T /usr/bin/security >/dev/null

echo "Import termine."
echo
echo "4) Verification des identites de signature:"
security find-identity -v -p codesigning

echo
echo "Termine."
echo "- Si 'Developer ID Application: ...' apparait, la signature est prete."
echo "- Fichiers generes: ${OUT_DIR}"
