"""A tightly constrained local Metasploit module-catalog lookup.

The AEGIS catalog never launches a Metasploit module. It can only ask a
locally installed msfconsole to list Redis *auxiliary scanner* module names for
an already verified Redis authentication finding. The resulting names are for human
review only.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any


class MetasploitCatalogAgent:
    """Lists only non-executed auxiliary Redis scanner candidates."""

    approved_finding = "CWE-306"
    max_candidates = 5

    def __init__(self):
        # Native keeps the existing Windows installation path. The optional Docker
        # backend is an explicit local-lab fallback and never runs a module.
        self.catalog_backend = os.getenv(
            "AEGIS_METASPLOIT_CATALOG_BACKEND", "native"
        ).lower()
        self.docker_image = os.getenv(
            "AEGIS_METASPLOIT_DOCKER_IMAGE",
            "metasploitframework/metasploit-framework:latest",
        )

    @staticmethod
    def _find_msfconsole() -> Path | None:
        """Find the local console without relying only on a stale IDE PATH."""
        command_on_path = shutil.which("msfconsole") or shutil.which("msfconsole.bat")
        if command_on_path:
            return Path(command_on_path)

        # The official Windows installer normally places the Framework here.
        windows_candidates = (
            Path("C:/metasploit-framework/bin/msfconsole.bat"),
            Path("C:/metasploit-framework/msfconsole.bat"),
        )
        return next((path for path in windows_candidates if path.is_file()), None)

    def review(self, target: str, findings: list[dict[str, Any]]) -> dict[str, Any]:
        if not any(finding.get("id") == self.approved_finding for finding in findings):
            return {
                "agent": "Metasploit Catalog Agent",
                "status": "not_needed",
                "reason": "No verified Redis authentication finding requires a catalog review.",
                "candidates": [],
            }

        if self.catalog_backend == "docker":
            return self._review_docker_catalog()
        if self.catalog_backend != "native":
            return {
                "agent": "Metasploit Catalog Agent",
                "status": "error",
                "source": "configuration",
                "reason": "AEGIS_METASPLOIT_CATALOG_BACKEND must be 'native' or 'docker'.",
                "candidates": [],
            }

        msfconsole_path = self._find_msfconsole()
        if not msfconsole_path:
            return {
                "agent": "Metasploit Catalog Agent",
                "status": "unavailable",
                "source": "local_metasploit",
                "reason": "Metasploit is not available on PATH. No module lookup or execution occurred.",
                "candidates": [],
            }

        search_command = "search type:exploit redis; exit -y"
        if msfconsole_path.suffix.lower() in {".bat", ".cmd"}:
            command = [
                "cmd.exe",
                "/d",
                "/s",
                "/c",
                str(msfconsole_path),
                "-q",
                "-x",
                search_command,
            ]
        else:
            command = [
                str(msfconsole_path),
                "-q",
                "-x",
                search_command,
            ]

        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=45,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return {
                "agent": "Metasploit Catalog Agent",
                "status": "error",
                "source": "local_metasploit",
                "reason": "The local catalog search exceeded the 45-second timeout. No module was executed.",
                "candidates": [],
            }

        if completed.returncode != 0:
            return {
                "agent": "Metasploit Catalog Agent",
                "status": "error",
                "source": "local_metasploit",
                "reason": completed.stderr.strip() or "The local Metasploit catalog search did not complete.",
                "candidates": [],
            }

        modules = self._extract_scanner_modules(completed.stdout)
        return self._completed_catalog(modules, source="local_metasploit")

    def _review_docker_catalog(self) -> dict[str, Any]:
        """List module names from an explicitly pre-pulled isolated container."""
        docker_path = shutil.which("docker")
        if not docker_path:
            return {
                "agent": "Metasploit Catalog Agent",
                "status": "unavailable",
                "source": "docker_metasploit",
                "reason": "Docker is not available on PATH. No container or module was started.",
                "candidates": [],
            }

        image_check = subprocess.run(
            [docker_path, "image", "inspect", self.docker_image],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        if image_check.returncode != 0:
            return {
                "agent": "Metasploit Catalog Agent",
                "status": "unavailable",
                "source": "docker_metasploit",
                "reason": (
                    "The configured Docker image is not installed locally. "
                    "No image download or module execution was attempted."
                ),
                "image": self.docker_image,
                "candidates": [],
            }

        command = [
            docker_path,
            "run",
            "--rm",
            "--network",
            "none",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--entrypoint",
            "/usr/src/metasploit-framework/msfconsole",
            self.docker_image,
            "-q",
            "-x",
            "search type:auxiliary redis; exit -y",
        ]
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=90,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return {
                "agent": "Metasploit Catalog Agent",
                "status": "error",
                "source": "docker_metasploit",
                "reason": "The isolated Docker catalog search exceeded the 90-second timeout. No module was executed.",
                "candidates": [],
            }

        if completed.returncode != 0:
            return {
                "agent": "Metasploit Catalog Agent",
                "status": "error",
                "source": "docker_metasploit",
                "reason": completed.stderr.strip() or "The isolated Docker catalog search did not complete.",
                "candidates": [],
            }

        return self._completed_catalog(
            self._extract_scanner_modules(completed.stdout),
            source="docker_metasploit",
            image=self.docker_image,
        )

    def _completed_catalog(
        self,
        modules: list[str],
        *,
        source: str,
        image: str | None = None,
    ) -> dict[str, Any]:
        """Return a consistent listing-only catalog response."""
        result = {
            "agent": "Metasploit Catalog Agent",
            "status": "completed",
            "source": source,
            "query_scope": "Redis auxiliary scanner module names only",
            "execution": "disabled",
            "human_approval_required": True,
            "reason": "The catalog listed local auxiliary scanner candidates. AEGIS does not launch modules or send payloads.",
            "candidates": [
                {
                    "module": module,
                    "allowed_action": "Human review only; execution is disabled in AEGIS.",
                }
                for module in modules
            ],
        }
        if image:
            result["image"] = image
        return result

    def _extract_scanner_modules(self, output: str) -> list[str]:
        matches = re.findall(r"\b((?:auxiliary|exploit)/[A-Za-z0-9_/-]+)\b", output)
        unique_modules = list(dict.fromkeys(matches))
        return unique_modules[: self.max_candidates]
