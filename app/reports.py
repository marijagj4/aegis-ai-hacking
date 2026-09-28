"""Persistent, human-readable reports for the controlled AEGIS lab."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORT_DIRECTORY = PROJECT_ROOT / "reports"
REPORT_INDEX = REPORT_DIRECTORY / "assessment_reports.jsonl"


class AssessmentReportStore:
    def __init__(self):
        REPORT_DIRECTORY.mkdir(exist_ok=True)
        self.entries: list[dict] = []

        if REPORT_INDEX.exists():
            with REPORT_INDEX.open("r", encoding="utf-8") as report_index:
                for line in report_index:
                    if line.strip():
                        self.entries.append(json.loads(line))

    def save(self, report: dict) -> dict:
        report_id = f"assessment-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{uuid4().hex[:8]}"
        file_name = f"{report_id}.md"
        entry = {
            "report_id": report_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "file_name": file_name,
            **report,
        }

        (REPORT_DIRECTORY / file_name).write_text(
            self._to_markdown(entry), encoding="utf-8"
        )
        with REPORT_INDEX.open("a", encoding="utf-8") as report_index:
            report_index.write(json.dumps(entry) + "\n")

        self.entries.append(entry)
        return entry

    def latest_assessment_for(self, target: str) -> dict | None:
        for entry in reversed(self.entries):
            if entry.get("target") == target and entry.get("mode") == "assessment":
                return entry
        return None

    def latest_open_assessment_for(self, target: str) -> dict | None:
        for entry in reversed(self.entries):
            if entry.get("target") == target and entry.get("assessment_state") == "OPEN":
                return entry
        return None

    def get(self, report_id: str) -> dict | None:
        return next((entry for entry in self.entries if entry["report_id"] == report_id), None)

    def path_for(self, report_id: str) -> Path | None:
        entry = self.get(report_id)
        return REPORT_DIRECTORY / entry["file_name"] if entry else None

    @staticmethod
    def _to_markdown(entry: dict) -> str:
        findings = entry.get("findings") or []
        findings_text = "No verified open finding." if not findings else "\n".join(
            f"- **{finding['id']} — {finding['title']}** ({finding['severity']}, {finding['status']})\n"
            f"  - Evidence: {finding['evidence']}\n"
            f"  - Remediation: {finding['remediation']}"
            for finding in findings
        )
        ports_text = "\n".join(
            f"- {port['port']}/{port['protocol']} — {port['state']} — {port['service']} {port['product']} {port['version']}".strip()
            for port in entry.get("nmap_scan", {}).get("ports", [])
        ) or "- No open approved port was reported."
        nmap_triage = entry.get("nmap_triage") or {}
        nmap_triage_text = nmap_triage.get(
            "analysis",
            nmap_triage.get("reason", nmap_triage.get("error", "No local model triage was generated.")),
        )
        nmap_triage_model = nmap_triage.get("model", "not run")
        catalog = entry.get("validation_catalog") or {}
        candidates = catalog.get("candidates") or []
        candidates_text = "\n".join(
            f"- `{candidate['module']}` — {candidate['allowed_action']}"
            for candidate in candidates
        ) or "- No catalog candidate was reviewed."
        catalog_text = (
            f"Status: **{catalog.get('status', 'not_requested')}**\n\n"
            f"{catalog.get('reason', 'Catalog review was not requested.')}\n\n"
            f"{candidates_text}"
        )
        catalog_match = entry.get("catalog_match") or {}
        catalog_match_text = catalog_match.get(
            "selection", "No model catalog match was generated."
        )

        return f"""# AEGIS Local Assessment Report

## Scope

- Report ID: `{entry['report_id']}`
- Created: `{entry['created_at']}`
- Mode: `{entry['mode']}`
- Target: `{entry['target']}`
- Assessment state: **{entry['assessment_state']}**

## Ethical scope decision

{entry['scope']['reason']}

## Nmap local-service-discovery result

{ports_text}

## Local Nmap triage

Model: `{nmap_triage_model}`

{nmap_triage_text}

## Verified findings

{findings_text}

## Verification result

{entry['verification']['reason']}

## Defensive recommendation

{entry.get('llm_summary', 'LLM recommendation was not requested for this run.')}

## Controlled validation catalog

{catalog_text}

## Local LLM catalog match

{catalog_match_text}

## Retest guidance

Apply the remediation manually in the approved local lab. Then run AEGIS retest and compare the new assessment state with this report.
"""
