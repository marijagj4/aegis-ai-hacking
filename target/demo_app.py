from fastapi import FastAPI
from datetime import datetime, timezone
from pydantic import BaseModel

app = FastAPI(title="AEGIS Local Demo Target")

received_records = []


class LocalAuditRecord(BaseModel):
    source: str
    data_label: str

@app.get("/lab-status")
def lab_status():
    return {
        "application": "demo-app",
        "environment": "LAB-ONLY",
        "marker": "SIMULATION_ONLY_EXPOSED_MARKER",
        "note": "This is fictitious training data, not a real secret."
    }

@app.post("/local-audit")
def receive_local_audit(record: LocalAuditRecord):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": record.source,
        "data_label": record.data_label
    }

    received_records.append(entry)

    return {
        "received": True,
        "message": "Fictitious LAB data was recorded locally.",
        "record": entry
    }


@app.get("/local-audit")
def get_local_audit():
    return {
        "received_records": received_records
    }