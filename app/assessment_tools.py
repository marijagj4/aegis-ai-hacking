"""Strictly local tools used by the AEGIS laboratory assessment workflow."""

from __future__ import annotations

import shutil
import socket
import subprocess
import xml.etree.ElementTree as element_tree
from typing import Any

import httpx


class EthicalScopeGuard:
    """Prevents the assessment workflow from addressing arbitrary systems."""

    def validate_target(self, target: str, lab_target: dict[str, Any] | None) -> dict[str, Any]:

        if not lab_target:
            return {
                "agent": "Ethical Scope Guard",
                "target": target,
                "allowed": False,
                "reason": "Only explicitly approved local Docker registry targets are in scope.",
            }

        if (
            lab_target.get("host") != "127.0.0.1"
            or lab_target.get("service") not in {"http", "redis"}
            or not isinstance(lab_target.get("port"), int)
            or not 1 <= lab_target["port"] <= 65535
        ):
            return {
                "agent": "Ethical Scope Guard",
                "target": target,
                "allowed": False,
                "reason": "The registry target does not satisfy loopback host, port, and verifier restrictions.",
            }

        return {
            "agent": "Ethical Scope Guard",
            "target": target,
            "allowed": True,
            "reason": "Target is an approved loopback-only Docker laboratory service discovered from container metadata.",
            "lab_target": lab_target,
        }


class NmapScannerAgent:
    """Runs one constrained service-discovery scan against an approved lab target."""

    def scan(self, lab_target: dict[str, Any]) -> dict[str, Any]:
        nmap_path = shutil.which("nmap")
        host = lab_target["host"]
        port = str(lab_target["port"])

        if not nmap_path:
            return {
                "agent": "Nmap Scanner Agent",
                "status": "not_run",
                "target": host,
                "reason": "Nmap is not installed or is not available on PATH.",
                "ports": [],
            }

        command = [
            nmap_path,
            "-Pn",
            "-sV",
            "--version-light",
            "--open",
            "-p",
            port,
            "-oX",
            "-",
            host,
        ]

        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return {
                "agent": "Nmap Scanner Agent",
                "status": "error",
                "target": host,
                "reason": "The local Nmap scan exceeded the 30-second lab timeout.",
                "ports": [],
            }

        if completed.returncode != 0:
            return {
                "agent": "Nmap Scanner Agent",
                "status": "error",
                "target": host,
                "reason": completed.stderr.strip() or "Nmap did not complete successfully.",
                "ports": [],
            }

        try:
            ports = self._parse_ports(completed.stdout)
        except element_tree.ParseError:
            return {
                "agent": "Nmap Scanner Agent",
                "status": "error",
                "target": host,
                "reason": "Nmap completed but did not return readable XML output.",
                "ports": [],
            }

        return {
            "agent": "Nmap Scanner Agent",
            "status": "completed",
            "target": host,
            "scan_profile": "local-service-discovery",
            "ports": ports,
        }

    @staticmethod
    def _parse_ports(xml_output: str) -> list[dict[str, str]]:
        root = element_tree.fromstring(xml_output)
        ports: list[dict[str, str]] = []

        for port in root.findall(".//port"):
            state = port.find("state")
            service = port.find("service")
            ports.append(
                {
                    "port": port.attrib.get("portid", "unknown"),
                    "protocol": port.attrib.get("protocol", "unknown"),
                    "state": state.attrib.get("state", "unknown") if state is not None else "unknown",
                    "service": service.attrib.get("name", "unknown") if service is not None else "unknown",
                    "product": service.attrib.get("product", "") if service is not None else "",
                    "version": service.attrib.get("version", "") if service is not None else "",
                }
            )

        return ports


class RedisAccessVerifier:
    """Performs a non-destructive PING check for the approved Redis lab only."""

    def verify(self, lab_target: dict[str, Any]) -> dict[str, Any]:
        if lab_target.get("service") != "redis":
            return {
                "agent": "Redis Access Verification Agent",
                "status": "unknown",
                "reason": "No safe verifier is registered for this local service.",
                "finding": None,
            }

        try:
            with socket.create_connection(
                (lab_target["host"], lab_target["port"]), timeout=5
            ) as connection:
                connection.sendall(b"*1\r\n$4\r\nPING\r\n")
                response = connection.recv(128).decode("utf-8", errors="replace").strip()
        except OSError as error:
            return {
                "agent": "Redis Access Verification Agent",
                "status": "unknown",
                "reason": f"Could not reach the approved local Redis lab: {error}",
                "finding": None,
            }

        if response.startswith("+PONG"):
            return {
                "agent": "Redis Access Verification Agent",
                "status": "open",
                "reason": "The lab Redis service accepted a non-destructive unauthenticated PING command.",
                "finding": {
                    "id": "CWE-306",
                    "title": "Redis service accepts unauthenticated commands",
                    "severity": "high",
                    "status": "OPEN",
                    "evidence": "Unauthenticated PING returned PONG in the loopback-only Docker lab.",
                    "remediation": "Require authentication, restrict network exposure, and run a retest.",
                },
            }

        if response.startswith("-NOAUTH"):
            return {
                "agent": "Redis Access Verification Agent",
                "status": "fixed",
                "reason": "The local Redis lab requires authentication before it accepts commands.",
                "finding": None,
            }

        return {
            "agent": "Redis Access Verification Agent",
            "status": "unknown",
            "reason": f"The local service returned an unexpected response: {response or 'empty response'}.",
            "finding": None,
        }


class HttpServiceVerifier:
    """Confirms that the approved web lab responds, without claiming a vulnerability."""

    def verify(self, lab_target: dict[str, Any]) -> dict[str, Any]:
        if lab_target.get("service") != "http":
            return {
                "agent": "HTTP Service Verification Agent",
                "status": "unknown",
                "reason": "No safe HTTP verifier is registered for this local service.",
                "finding": None,
            }

        url = f"http://{lab_target['host']}:{lab_target['port']}/lab-status"
        try:
            response = httpx.get(url, timeout=5.0)
            response.raise_for_status()
        except httpx.HTTPError as error:
            return {
                "agent": "HTTP Service Verification Agent",
                "status": "unknown",
                "reason": f"Could not reach the approved local web lab: {error}",
                "finding": None,
            }

        return {
            "agent": "HTTP Service Verification Agent",
            "status": "verified",
            "reason": "The approved local FastAPI web service responded to its lab-status endpoint. This is service discovery only, not a vulnerability claim.",
            "finding": None,
        }
