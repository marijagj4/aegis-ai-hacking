import json
from datetime import datetime, timezone
from pathlib import Path


AUDIT_FILE = Path(__file__).resolve().parent.parent / "audit_log.jsonl"


class AuditLogger:
    def __init__(self):
        self.entries = []

        if AUDIT_FILE.exists():
            with AUDIT_FILE.open("r", encoding="utf-8") as file:
                for line in file:
                    if line.strip():
                        self.entries.append(json.loads(line))

    def record(self, event: str, target: str, decision: str):
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event": event,
            "target": target,
            "decision": decision
        }

        self.entries.append(entry)

        with AUDIT_FILE.open("a", encoding="utf-8") as file:
            file.write(json.dumps(entry) + "\n")

        return entry

    def get_entries(self):
        return self.entries
