class PolicyGuardian:
    def check_target(self, target: str, approved_targets: set[str] | None = None):
        approved_targets = approved_targets or set()
        if target in approved_targets:
            return {
                "agent": "Policy Guardian",
                "target": target,
                "allowed": True,
                "reason": "Target is present in the approved local Docker lab registry."
            }

        return {
            "agent": "Policy Guardian",
            "target": target,
            "allowed": False,
            "reason": "Target is not approved in the local Docker lab registry."
        }


class PromptGuardAgent:
    blocked_phrases = [
        "ignore previous instructions",
        "ignore all rules",
        "reveal secret",
        "system prompt"
    ]

    def inspect_prompt(self, message: str):
        clean_message = message.lower()

        for phrase in self.blocked_phrases:
            if phrase in clean_message:
                return {
                    "agent": "Prompt Guard Agent",
                    "decision": "block",
                    "is_injection": True,
                    "reason": f"Suspicious phrase detected: {phrase}"
                }

        return {
            "agent": "Prompt Guard Agent",
            "decision": "allow",
            "is_injection": False,
            "reason": "No suspicious instruction was detected."
        }

class TransferGuardian:
    allowed_destinations = {"local_audit"}

    def check_transfer(self, destination: str, data_label: str):
        if destination in self.allowed_destinations:
            return {
                "agent": "Transfer Guardian",
                "action": "simulated_transfer",
                "data_label": data_label,
                "destination": destination,
                "allowed": True,
                "reason": "Local audit destination is allowed. A local-only audit transfer may proceed."
            }

        return {
            "agent": "Transfer Guardian",
            "action": "simulated_transfer",
            "data_label": data_label,
            "destination": destination,
            "allowed": False,
            "reason": "External transfer is blocked by the AEGIS policy. No data was sent."
        }
