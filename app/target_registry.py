"""Dynamic, local-only Docker lab discovery with explicit approval."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class TargetRegistry:
    """Stores discovered Docker labs separately from the application source code.

    A container must opt in through AEGIS labels and bind its selected port only
    to 127.0.0.1. Discovery creates a PENDING record; a separate approval step
    is required before Nmap can receive the record.
    """

    _target_id_pattern = re.compile(r"^[a-z][a-z0-9-]{1,48}$")
    _container_port_pattern = re.compile(r"^([1-9][0-9]{0,4})/tcp$")
    _allowed_verifiers = {"http", "redis"}

    def __init__(self, registry_path: Path | None = None):
        self.registry_path = registry_path or (
            Path(__file__).resolve().parent.parent / "data" / "target_registry.json"
        )

    def list_targets(self) -> dict[str, Any]:
        records = list(self._records().values())
        records.sort(key=lambda record: record["id"])
        return {
            "agent": "Docker Discovery Agent",
            "approved": [record for record in records if record["status"] == "approved"],
            "pending": [record for record in records if record["status"] == "pending"],
            "rejected": [record for record in records if record["status"] == "rejected"],
        }

    def approved_target_ids(self) -> set[str]:
        return {
            target_id
            for target_id, record in self._records().items()
            if record.get("status") == "approved"
        }

    def get_approved_target(self, target_id: str) -> dict[str, Any] | None:
        record = self._records().get(target_id)
        if not record or record.get("status") != "approved":
            return None
        return {
            "host": record["host"],
            "port": record["port"],
            "service": record["service"],
            "description": record["description"],
            "container_name": record["container_name"],
            "discovery_source": "docker_label_registry",
        }

    def discover(self) -> dict[str, Any]:
        """Discover opt-in local Docker containers without touching their services."""
        docker_path = shutil.which("docker")
        if not docker_path:
            return {
                "agent": "Docker Discovery Agent",
                "status": "unavailable",
                "reason": "Docker CLI is not available on PATH.",
                "discovered": [],
                "rejected": [],
            }

        try:
            listed = subprocess.run(
                [docker_path, "ps", "--filter", "label=aegis.lab=true", "--format", "{{.ID}}"],
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return {
                "agent": "Docker Discovery Agent",
                "status": "error",
                "reason": "Docker discovery exceeded the 15-second timeout.",
                "discovered": [],
                "rejected": [],
            }

        if listed.returncode != 0:
            return {
                "agent": "Docker Discovery Agent",
                "status": "unavailable",
                "reason": listed.stderr.strip() or "Docker discovery did not complete.",
                "discovered": [],
                "rejected": [],
            }

        container_ids = [line.strip() for line in listed.stdout.splitlines() if line.strip()]
        if not container_ids:
            return {
                "agent": "Docker Discovery Agent",
                "status": "completed",
                "reason": "No running containers opted in with the aegis.lab=true label.",
                "discovered": [],
                "rejected": [],
            }

        try:
            inspected = subprocess.run(
                [docker_path, "inspect", *container_ids],
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return {
                "agent": "Docker Discovery Agent",
                "status": "error",
                "reason": "Docker inspect exceeded the 15-second timeout.",
                "discovered": [],
                "rejected": [],
            }
        if inspected.returncode != 0:
            return {
                "agent": "Docker Discovery Agent",
                "status": "error",
                "reason": inspected.stderr.strip() or "Docker inspect did not complete.",
                "discovered": [],
                "rejected": [],
            }

        try:
            containers = json.loads(inspected.stdout)
        except json.JSONDecodeError:
            return {
                "agent": "Docker Discovery Agent",
                "status": "error",
                "reason": "Docker inspect did not return readable JSON.",
                "discovered": [],
                "rejected": [],
            }

        records = self._records()
        discovered: list[dict[str, Any]] = []
        rejected: list[dict[str, str]] = []
        if not isinstance(containers, list):
            return {
                "agent": "Docker Discovery Agent",
                "status": "error",
                "reason": "Docker inspect returned an unexpected data format.",
                "discovered": [],
                "rejected": [],
            }

        for container in containers:
            if not isinstance(container, dict):
                rejected.append({
                    "container_name": "unknown",
                    "reason": "Docker inspect returned an invalid container record.",
                })
                continue
            candidate, reason = self._build_candidate(container)
            if not candidate:
                rejected.append({
                    "container_name": str(container.get("Name", "unknown")).lstrip("/"),
                    "reason": reason,
                })
                continue

            existing = records.get(candidate["id"])
            unchanged = bool(
                existing
                and existing.get("container_id") == candidate["container_id"]
                and existing.get("fingerprint") == candidate["fingerprint"]
            )
            candidate["status"] = "approved" if unchanged and existing.get("status") == "approved" else "pending"
            candidate["discovered_at"] = self._now()
            records[candidate["id"]] = candidate
            discovered.append(candidate)

        self._save_records(records)
        return {
            "agent": "Docker Discovery Agent",
            "status": "completed",
            "reason": "Only labeled loopback Docker containers were considered. New or changed containers remain pending until approval.",
            "discovered": discovered,
            "rejected": rejected,
        }

    def approve(self, target_id: str) -> dict[str, Any]:
        records = self._records()
        record = records.get(target_id)
        if not record:
            return {
                "agent": "Target Approval Agent",
                "status": "not_found",
                "reason": "Discover a labeled local Docker lab before approving it.",
            }
        if record.get("status") == "rejected":
            return {
                "agent": "Target Approval Agent",
                "status": "blocked",
                "reason": "Rejected containers cannot be approved.",
            }

        record["status"] = "approved"
        record["approved_at"] = self._now()
        records[target_id] = record
        self._save_records(records)
        return {
            "agent": "Target Approval Agent",
            "status": "approved",
            "reason": "The local Docker lab is now eligible for the constrained assessment workflow.",
            "target": record,
        }

    def _build_candidate(self, container: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
        labels = (container.get("Config") or {}).get("Labels") or {}
        target_id = labels.get("aegis.target_id", "")
        verifier = labels.get("aegis.verifier", "")
        container_port = labels.get("aegis.container_port", "")
        description = labels.get("aegis.description", "")

        if not self._target_id_pattern.fullmatch(target_id):
            return None, "aegis.target_id must be a lowercase identifier such as web-lab."
        if verifier not in self._allowed_verifiers:
            return None, "aegis.verifier must be http or redis."
        if not self._container_port_pattern.fullmatch(container_port):
            return None, "aegis.container_port must use the format 8081/tcp."
        if not description or len(description) > 160:
            return None, "aegis.description is required and must be at most 160 characters."

        port_bindings = ((container.get("NetworkSettings") or {}).get("Ports") or {}).get(container_port) or []
        loopback_bindings = [
            binding for binding in port_bindings
            if binding.get("HostIp") == "127.0.0.1" and str(binding.get("HostPort", "")).isdigit()
        ]
        if len(loopback_bindings) != 1 or len(port_bindings) != 1:
            return None, "The labeled container port must have exactly one 127.0.0.1 host binding."

        port = int(loopback_bindings[0]["HostPort"])
        if not 1 <= port <= 65535:
            return None, "The discovered host port is invalid."

        container_id = str(container.get("Id", ""))
        if not container_id:
            return None, "Docker did not provide a container identifier."

        fingerprint = "|".join([target_id, verifier, container_port, str(port), description])
        return {
            "id": target_id,
            "container_id": container_id,
            "container_name": str(container.get("Name", "")).lstrip("/"),
            "host": "127.0.0.1",
            "port": port,
            "service": verifier,
            "description": description,
            "fingerprint": fingerprint,
        }, ""

    def _records(self) -> dict[str, dict[str, Any]]:
        if not self.registry_path.exists():
            return {}
        try:
            payload = json.loads(self.registry_path.read_text(encoding="utf-8"))
            records = payload.get("targets", {})
            return records if isinstance(records, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _save_records(self, records: dict[str, dict[str, Any]]) -> None:
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = self.registry_path.with_suffix(".tmp")
        temporary_path.write_text(
            json.dumps({"targets": records}, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        os.replace(temporary_path, self.registry_path)

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()
