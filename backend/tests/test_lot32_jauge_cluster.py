"""Lot 32 — jauge du cluster de production : couleurs, pourcentages, mesure (client Motor simulé), route administrateur.
Lancer : cd backend && python -m pytest tests/test_lot32_jauge_cluster.py -q
"""
import asyncio

from fastapi.testclient import TestClient

import jauge_cluster as jc
from server import app


def test_couleurs_aux_seuils_de_sawali():
    # vert < 45 % · orange >= 45 % · rouge >= 90 %
    assert jc.niveau(0.44) == "ok" and jc.niveau(0.45) == "attention" and jc.niveau(0.89) == "attention"
    assert jc.niveau(0.90) == "plein" and jc.niveau(1.0) == "plein"


def test_limite_par_defaut_et_variable(monkeypatch):
    monkeypatch.delenv("ATLAS_LIMITE_MO", raising=False)
    s = jc.synthese(1150.5, 500)
    assert s["taille"]["limite_mo"] == 5120.0 and s["taille"]["pourcentage"] == 22.5
    assert s["collections"]["niveau"] == "plein" and s["niveau"] == "plein"
    monkeypatch.setenv("ATLAS_LIMITE_MO", "512")        # cluster gratuit M0
    assert jc.synthese(513.2, 10)["taille"]["niveau"] == "plein"
    monkeypatch.setenv("ATLAS_LIMITE_MO", "abc")        # illisible : défaut
    assert jc.synthese(10, 10)["taille"]["limite_mo"] == 5120.0


# --- Client Motor simulé : deux bases + bases internes à ignorer
class _Base:
    def __init__(self, octets, collections):
        self.o, self.c = octets, collections

    async def command(self, nom):
        return {"dataSize": self.o, "indexSize": self.o}

    async def list_collection_names(self):
        return [f"c{i}" for i in range(self.c)]


class _Client:
    bases = {"sawali_bfmobility": _Base(100 * 1024 * 1024, 30), "sawali": _Base(50 * 1024 * 1024, 70)}

    async def list_database_names(self):
        return [*self.bases, "admin", "local"]

    def __getitem__(self, nom):
        return self.bases[nom]


def test_mesure_cumule_les_bases_et_ignore_les_internes():
    jc._cache.update(t=0.0, mesure=None)
    m = asyncio.run(jc.mesurer(_Client(), "sawali_bfmobility", forcer=True))
    assert m["taille"]["total_mo"] == 300.0 and m["collections"]["total"] == 100
    assert m["bases"][0]["nom"] == "sawali_bfmobility" and m["bases"][0]["courante"] is True


def test_route_reservee_a_l_administrateur():
    with TestClient(app) as c:
        assert c.get("/api/admin/atlas/jauge").status_code in (401, 403)
        r = c.post("/api/auth/connexion", json={"identifiant": "admin@test.bf", "mot_de_passe": "admin-test-123"})
        h = {"Authorization": f"Bearer {r.json()['jeton']}"}
        j = c.get("/api/admin/atlas/jauge", headers=h)
        assert j.status_code == 200, j.text
        assert {"taille", "collections", "niveau", "pourcentage", "bases"} <= set(j.json())
