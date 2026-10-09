"""Documents scannés des véhicules (lot 11).

Demande du propriétaire (09/10/2026) : « en plus de l'assurance il y a la visite technique et la taxe sur les
véhicules à moteur (TVM). Pour cette dernière on doit enregistrer en plus la référence de la transaction, le montant
payé et le type de paiement. C'est un document délivré par les impôts. On pourrait même le scanner pour le stocker. »

Pour un développeur WinDev :
  - les dates d'échéance, la référence, le montant et le mode de paiement de la TVM sont des rubriques ordinaires
    de la fiche véhicule (routes/admin.py) ;
  - le SCAN de chaque document est un enregistrement de la collection « documents_vehicules » (comme un fichier
    HFSQL avec une rubrique binaire) : identifiant, véhicule, document (assurance / visite_technique / tvm), type
    (JPEG, PNG, WebP ou PDF), nom du fichier d'origine et contenu ;
  - la fiche du véhicule garde un petit résumé « scans » : {document: {id, nom, maj_le}} ;
  - contrairement aux photos, un scan n'est JAMAIS public : il n'est servi qu'au personnel connecté ;
  - une photo est réduite par le navigateur avant l'envoi ; un PDF est envoyé tel quel (4 Mo au plus).

Routes :
  GET    /api/admin/vehicules/{id}/documents                 état des 3 scans du véhicule
  PUT    /api/admin/vehicules/{id}/documents/{doc}           envoi / remplacement d'un scan (direction, exploitation)
  GET    /api/admin/vehicules/{id}/documents/{doc}/fichier   le fichier lui-même (personnel du parc)
  DELETE /api/admin/vehicules/{id}/documents/{doc}           suppression du scan
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Body, Depends, HTTPException, Response

from db import db
from metier import iso
from outils import nouvel_id
from routes.photos_vehicules import decoder, type_image, vehicule_ou_404
from securite import ATELIER, EQUIPE, exiger

router = APIRouter(tags=["Documents des véhicules"])

# Les 3 documents officiels d'un véhicule, dans l'ordre d'affichage
DOCUMENTS: Dict[str, str] = {
    "assurance": "Attestation d'assurance",
    "visite_technique": "Visite technique",
    "tvm": "Taxe sur les véhicules à moteur (TVM)",
}
TAILLE_MAX = 4 * 1024 * 1024   # 4 Mo par scan


def type_fichier(donnees: bytes) -> str:
    """Type MIME d'après les premiers octets : image (JPEG, PNG, WebP) ou PDF ; vide si refusé."""
    if donnees.startswith(b"%PDF-"):
        return "application/pdf"
    return type_image(donnees)


def document_ou_422(doc: str) -> str:
    if doc not in DOCUMENTS:
        raise HTTPException(status_code=422, detail="Document inconnu (assurance, visite_technique ou tvm)")
    return doc


@router.get("/admin/vehicules/{vid}/documents")
async def lire_documents(vid: str, u: dict = Depends(exiger(*ATELIER))):
    """Les 3 emplacements de scan du véhicule, remplis ou non."""
    v = await vehicule_ou_404(vid)
    scans = v.get("scans") or {}
    return {"documents": [{"document": d, "libelle": libelle,
                           "present": isinstance(scans.get(d), dict),
                           "nom": (scans.get(d) or {}).get("nom") if isinstance(scans.get(d), dict) else None,
                           "type": (scans.get(d) or {}).get("type") if isinstance(scans.get(d), dict) else None,
                           "maj_le": (scans.get(d) or {}).get("maj_le") if isinstance(scans.get(d), dict) else None}
                          for d, libelle in DOCUMENTS.items()]}


@router.put("/admin/vehicules/{vid}/documents/{doc}")
async def envoyer_document(vid: str, doc: str, corps: Dict[str, Any] = Body(...), u: dict = Depends(exiger(*EQUIPE))):
    """Envoi ou remplacement d'un scan : {fichier: "data:…;base64,…", nom: "tvm-2026.pdf"}."""
    doc = document_ou_422(doc)
    v = await vehicule_ou_404(vid)
    donnees = decoder(str(corps.get("fichier") or ""))
    if not donnees:
        raise HTTPException(status_code=422, detail="Fichier vide")
    if len(donnees) > TAILLE_MAX:
        raise HTTPException(status_code=413, detail="Fichier trop lourd (4 Mo au plus)")
    mime = type_fichier(donnees)
    if not mime:
        raise HTTPException(status_code=415, detail="Format accepté : PDF, JPEG, PNG ou WebP")
    nom = str(corps.get("nom") or "").strip()[:120] or f"{doc}.{'pdf' if mime == 'application/pdf' else 'jpg'}"
    ancien = ((v.get("scans") or {}).get(doc) or {}).get("id")
    sid = nouvel_id()
    await db.documents_vehicules.insert_one({"id": sid, "vehicule_id": vid, "document": doc, "type": mime, "nom": nom,
                                            "taille": len(donnees), "donnees": donnees, "cree_le": iso(), "par": u.get("id")})
    await db.vehicules.update_one({"id": vid}, {"$set": {f"scans.{doc}": {"id": sid, "nom": nom, "type": mime, "maj_le": iso()}}})
    if ancien:
        await db.documents_vehicules.delete_one({"id": ancien})   # l'ancien scan de ce document est remplacé
    return {"document": doc, "libelle": DOCUMENTS[doc], "nom": nom, "type": mime}


@router.get("/admin/vehicules/{vid}/documents/{doc}/fichier")
async def fichier_document(vid: str, doc: str, u: dict = Depends(exiger(*ATELIER))):
    """Le scan lui-même (affiché dans le navigateur, jamais gardé en cache public)."""
    doc = document_ou_422(doc)
    v = await vehicule_ou_404(vid)
    sid = ((v.get("scans") or {}).get(doc) or {}).get("id")
    d = await db.documents_vehicules.find_one({"id": sid}, {"_id": 0, "type": 1, "donnees": 1}) if sid else None
    if not d:
        raise HTTPException(status_code=404, detail="Aucun scan pour ce document")
    return Response(content=bytes(d["donnees"]), media_type=d.get("type") or "application/octet-stream",
                    headers={"Cache-Control": "private, no-store"})


@router.delete("/admin/vehicules/{vid}/documents/{doc}")
async def supprimer_document(vid: str, doc: str, u: dict = Depends(exiger(*EQUIPE))):
    doc = document_ou_422(doc)
    v = await vehicule_ou_404(vid)
    ancien = ((v.get("scans") or {}).get(doc) or {}).get("id")
    await db.vehicules.update_one({"id": vid}, {"$unset": {f"scans.{doc}": ""}})
    if ancien:
        await db.documents_vehicules.delete_one({"id": ancien})
    return {"ok": True}


async def supprimer_documents_du_vehicule(vid: str) -> None:
    """Appelée à la suppression d'un véhicule : ses scans sont supprimés aussi."""
    await db.documents_vehicules.delete_many({"vehicule_id": vid})
