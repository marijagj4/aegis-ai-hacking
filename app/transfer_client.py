import httpx


class LocalAuditClient:
    audit_url = "http://127.0.0.1:8082/local-audit"

    def send_lab_marker(self, marker: str):
        payload = {
            "source": "aegis-control-center",
            "data_label": marker
        }

        try:
            response = httpx.post(
                self.audit_url,
                json=payload,
                timeout=5.0
            )
            response.raise_for_status()

            return {
                "sent": True,
                "destination": "local_audit",
                "receiver_response": response.json()
            }

        except httpx.HTTPError as error:
            return {
                "sent": False,
                "error": f"Local audit receiver is unavailable: {error}"
            }
