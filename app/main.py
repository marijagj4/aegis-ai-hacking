from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.agents import PolicyGuardian,PromptGuardAgent,TransferGuardian
from app.ollama_client import OllamaClient
from app.audit import AuditLogger
from app.assessment_tools import (
    EthicalScopeGuard,
    HttpServiceVerifier,
    NmapScannerAgent,
    RedisAccessVerifier,
)
from app.metasploit_catalog import MetasploitCatalogAgent
from app.reports import AssessmentReportStore
from app.target_registry import TargetRegistry
from app.transfer_client import LocalAuditClient

app = FastAPI(title="AEGIS")
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")
policy_guardian = PolicyGuardian()
prompt_guard_agent = PromptGuardAgent()
ollama_client = OllamaClient()
audit_logger = AuditLogger()
transfer_guardian = TransferGuardian()
local_audit_client = LocalAuditClient()
ethical_scope_guard = EthicalScopeGuard()
nmap_scanner = NmapScannerAgent()
redis_access_verifier = RedisAccessVerifier()
http_service_verifier = HttpServiceVerifier()
metasploit_catalog_agent = MetasploitCatalogAgent()
report_store = AssessmentReportStore()
target_registry = TargetRegistry()

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "aegis"
    }

@app.get("/policy/{target}")
def check_policy(target: str):
    return policy_guardian.check_target(target, target_registry.approved_target_ids())


@app.get("/targets")
def list_targets():
    """List dynamically discovered local labs by approval state."""
    return target_registry.list_targets()


@app.post("/discover-local-labs")
def discover_local_labs():
    """Read opt-in Docker labels. This does not contact or scan any container."""
    result = target_registry.discover()
    audit_logger.record(
        event="docker_lab_discovery_requested",
        target="local_docker",
        decision="allow" if result.get("status") == "completed" else "error",
    )
    return result


@app.post("/approve-local-lab")
def approve_local_lab(target_id: str):
    result = target_registry.approve(target_id)
    audit_logger.record(
        event="local_lab_approval_requested",
        target=target_id,
        decision="allow" if result.get("status") == "approved" else "block",
    )
    return result

@app.get("/prompt-check")
def prompt_check(message: str):
    return prompt_guard_agent.inspect_prompt(message)


@app.get("/model-config")
def model_config():
    """Expose local model names and non-security-critical routing roles."""
    return ollama_client.local_model_configuration()


@app.post("/model-config")
def update_model_config(triage_model: str, analysis_model: str):
    result = ollama_client.configure_local_models(triage_model, analysis_model)
    audit_logger.record(
        event="local_model_roles_updated",
        target="local_llm",
        decision="allow" if result.get("status") == "ready" else "error",
    )
    return result

@app.get("/safe-llm")
def safe_llm(message: str):
    rule_guard_result = prompt_guard_agent.inspect_prompt(message)

    if rule_guard_result["decision"] == "block":
        audit_logger.record(
            event="prompt_rule_checked",
            target="local_llm",
            decision="block"
        )

        return {
            "guard": rule_guard_result,
            "rule_guard": rule_guard_result,
            "semantic_guard": {
                "agent": "Semantic Prompt Guard",
                "status": "not_run",
                "reason": "The rule-based guard already blocked this message.",
            },
            "llm_called": False,
            "message": "The request was blocked before it reached Ollama."
        }

    audit_logger.record(
        event="prompt_rule_checked",
        target="local_llm",
        decision="allow"
    )

    semantic_guard_result = ollama_client.classify_prompt_safety(message)
    if semantic_guard_result["decision"] != "allow":
        audit_logger.record(
            event="prompt_semantic_checked",
            target="local_llm",
            decision="block"
        )
        return {
            "guard": semantic_guard_result,
            "rule_guard": rule_guard_result,
            "semantic_guard": semantic_guard_result,
            "llm_called": False,
            "message": "The request was blocked by semantic safety review before answer generation."
        }

    audit_logger.record(
        event="prompt_semantic_checked",
        target="local_llm",
        decision="allow"
    )

    llm_result = ollama_client.answer_safe_question(message)

    return {
        "guard": semantic_guard_result,
        "rule_guard": rule_guard_result,
        "semantic_guard": semantic_guard_result,
        "llm_called": True,
        "llm": llm_result
    }
@app.get("/audit")
def audit():
    return {
        "entries": audit_logger.get_entries()
    }

def _report_summary(report: dict) -> dict:
    return {
        "report_id": report["report_id"],
        "assessment_state": report["assessment_state"],
        "download_url": f"/reports/{report['report_id']}",
    }


def _verify_local_service(lab_target: dict) -> dict:
    """Route the fixed local target to its registered non-destructive verifier."""
    if lab_target["service"] == "redis":
        return redis_access_verifier.verify(lab_target)
    if lab_target["service"] == "http":
        return http_service_verifier.verify(lab_target)

    return {
        "agent": "Local Service Verification Agent",
        "status": "unknown",
        "reason": "No non-destructive verifier is registered for this approved local service.",
        "finding": None,
    }


def _review_validation_catalog(target: str, findings: list[dict]) -> tuple[dict, dict | None]:
    """Perform a local listing-only catalog review after a verified finding."""
    catalog_result = metasploit_catalog_agent.review(target, findings)
    catalog_status = catalog_result["status"]
    catalog_decision = {
        "completed": "allow",
        "error": "error",
    }.get(catalog_status, "info")
    audit_logger.record(
        event="metasploit_catalog_reviewed",
        target=target,
        decision=catalog_decision,
    )

    candidates = catalog_result.get("candidates", [])
    if not candidates:
        return catalog_result, None

    catalog_match = ollama_client.select_catalog_candidate(
        target,
        findings[0],
        candidates,
    )
    audit_logger.record(
        event="llm_catalog_match_generated",
        target=target,
        decision="allow" if "selection" in catalog_match else "error",
    )
    return catalog_result, catalog_match


def _execute_tool_assessment(target: str, mode: str) -> dict:
    """Run the assessment only after both policy and ethical scope checks pass."""
    lab_target = target_registry.get_approved_target(target)
    policy_result = policy_guardian.check_target(target, target_registry.approved_target_ids())
    scope_result = ethical_scope_guard.validate_target(target, lab_target)

    if not policy_result["allowed"] or not scope_result["allowed"]:
        audit_logger.record(
            event="assessment_requested",
            target=target,
            decision="block",
        )
        return {
            "assessment_state": "BLOCKED",
            "blocked_marker": {
                "status": "BLOCKED",
                "reason": "Policy or Ethical Scope Guard rejected the target.",
                "tools_called": [],
            },
            "policy": policy_result,
            "scope": scope_result,
            "message": "Assessment was blocked before any scanning tool was called.",
        }

    audit_logger.record(
        event="ethical_scope_validated",
        target=target,
        decision="allow",
    )

    nmap_result = nmap_scanner.scan(scope_result["lab_target"])
    nmap_decision = "allow" if nmap_result["status"] == "completed" else "error"
    audit_logger.record(
        event="nmap_scan_requested",
        target=target,
        decision=nmap_decision,
    )

    if nmap_result["status"] != "completed":
        nmap_triage = {
            "agent": "Nmap Triage Agent",
            "status": "not_run",
            "reason": "Triage was not run because the required Nmap scan did not complete.",
        }
        verification_result = {
            "agent": "Redis Access Verification Agent",
            "status": "unknown",
            "reason": "Verification was not run because the required Nmap scan did not complete.",
            "finding": None,
        }
        report = report_store.save(
            {
                "target": target,
                "mode": mode,
                "assessment_state": "UNKNOWN",
                "scope": scope_result,
                "nmap_scan": nmap_result,
                "nmap_triage": nmap_triage,
                "verification": verification_result,
                "findings": [],
                "llm_summary": "No LLM summary was generated because Nmap did not complete.",
                "validation_catalog": None,
                "catalog_match": None,
            }
        )
        audit_logger.record(
            event="assessment_report_generated",
            target=target,
            decision="error",
        )
        return {
            "policy": policy_result,
            "scope": scope_result,
            "nmap_scan": nmap_result,
            "nmap_triage": nmap_triage,
            "verification": verification_result,
            "findings": [],
            "validation_catalog": None,
            "catalog_match": None,
            "report": _report_summary(report),
            "message": "Assessment stopped because the required local Nmap scan did not complete.",
        }

    nmap_triage = ollama_client.summarize_nmap_scan(target, nmap_result)
    audit_logger.record(
        event="nmap_triage_generated",
        target=target,
        decision="allow" if "analysis" in nmap_triage else "error",
    )

    scanned_port_is_open = any(
        port.get("port") == str(scope_result["lab_target"]["port"])
        and port.get("state") == "open"
        for port in nmap_result["ports"]
    )
    if scanned_port_is_open:
        verification_result = _verify_local_service(scope_result["lab_target"])
    else:
        verification_result = {
            "agent": "Local Service Verification Agent",
            "status": "unknown",
            "reason": "Verification was not run because Nmap did not confirm the approved local service port as open.",
            "finding": None,
        }
    findings = [verification_result["finding"]] if verification_result["finding"] else []
    assessment_state = {
        "open": "OPEN",
        "fixed": "FIXED",
        "verified": "NO_FINDING",
    }.get(verification_result["status"], "UNKNOWN")
    verification_decision = "allow" if assessment_state in {"OPEN", "FIXED", "NO_FINDING"} else "error"
    audit_logger.record(
        event="local_vulnerability_verified",
        target=target,
        decision=verification_decision,
    )

    if findings:
        catalog_result, catalog_match = _review_validation_catalog(target, findings)
        llm_result = ollama_client.generate_assessment_recommendations(
            target,
            nmap_result,
            findings,
            nmap_triage,
        )
        llm_summary = llm_result.get("analysis") or llm_result.get("error", "No LLM summary returned.")
        audit_logger.record(
            event="llm_remediation_generated",
            target=target,
            decision="allow" if "analysis" in llm_result else "error",
        )
    else:
        llm_result = None
        catalog_result = {
            "agent": "Metasploit Catalog Agent",
            "status": "not_needed",
            "reason": "No verified open finding requires a catalog review.",
            "candidates": [],
        }
        catalog_match = None
        if verification_result["status"] == "verified":
            llm_summary = "The approved web service was observed. No vulnerability was asserted and no LLM remediation was requested."
        else:
            llm_summary = "No verified open finding. Apply the intended patch state and use retest to confirm it remains fixed."

    report = report_store.save(
        {
            "target": target,
            "mode": mode,
            "assessment_state": assessment_state,
            "scope": scope_result,
            "nmap_scan": nmap_result,
            "nmap_triage": nmap_triage,
            "verification": verification_result,
            "findings": findings,
            "llm_summary": llm_summary,
            "validation_catalog": catalog_result,
            "catalog_match": catalog_match,
        }
    )
    audit_logger.record(
        event="assessment_report_generated",
        target=target,
        decision="allow",
    )

    return {
        "policy": policy_result,
        "scope": scope_result,
        "nmap_scan": nmap_result,
        "nmap_triage": nmap_triage,
        "verification": verification_result,
        "findings": findings,
        "llm": llm_result,
        "validation_catalog": catalog_result,
        "catalog_match": catalog_match,
        "report": _report_summary(report),
    }


@app.get("/run-assessment")
def run_assessment(target: str):
    audit_logger.record(
        event="assessment_requested",
        target=target,
        decision="allow",
    )
    return _execute_tool_assessment(target, mode="assessment")


@app.get("/retest")
def retest(target: str):
    lab_target = target_registry.get_approved_target(target)
    if not lab_target or lab_target.get("service") != "redis":
        policy_result = policy_guardian.check_target(target, target_registry.approved_target_ids())
        scope_result = ethical_scope_guard.validate_target(target, lab_target)
        return {
            "policy": policy_result,
            "scope": scope_result,
            "retest": {
                "baseline_report_id": None,
                "status": "NOT_APPLICABLE",
                "message": "Retest is registered only for the Redis authentication-remediation lab.",
            },
        }

    # A remediation retest must compare the current state with an earlier OPEN
    # finding, not simply whichever assessment report happened to be newest.
    baseline = report_store.latest_open_assessment_for(target)
    result = _execute_tool_assessment(target, mode="retest")
    current_state = result.get("report", {}).get("assessment_state", "UNKNOWN")

    if not baseline:
        retest_state = "NO_BASELINE"
        message = "No earlier OPEN assessment report exists. Run an assessment that verifies a finding before using retest."
    elif current_state == "FIXED" and baseline["assessment_state"] == "OPEN":
        retest_state = "FIXED"
        message = "The previous open finding is no longer verified in the local lab."
    elif current_state == "OPEN":
        retest_state = "STILL_OPEN"
        message = "The finding is still present. Apply remediation and run retest again."
    else:
        retest_state = "UNKNOWN"
        message = "The retest could not confirm a remediation state. Review the report."

    audit_logger.record(
        event="retest_completed",
        target=target,
        decision="allow" if retest_state == "FIXED" else "error" if retest_state == "UNKNOWN" else "block",
    )
    result["retest"] = {
        "baseline_report_id": baseline["report_id"] if baseline else None,
        "status": retest_state,
        "message": message,
    }
    return result


@app.get("/catalog-review")
def catalog_review(target: str):
    """Review the latest open local finding without launching any module."""
    lab_target = target_registry.get_approved_target(target)
    policy_result = policy_guardian.check_target(target, target_registry.approved_target_ids())
    scope_result = ethical_scope_guard.validate_target(target, lab_target)
    if not policy_result["allowed"] or not scope_result["allowed"]:
        audit_logger.record(
            event="metasploit_catalog_review_requested",
            target=target,
            decision="block",
        )
        return {
            "policy": policy_result,
            "scope": scope_result,
            "message": "Catalog review was blocked before the local tool was called.",
        }

    if lab_target.get("service") != "redis":
        return {
            "policy": policy_result,
            "scope": scope_result,
            "catalog": {
                "agent": "Metasploit Catalog Agent",
                "status": "not_applicable",
                "reason": "Catalog review is registered only for an approved Redis authentication lab.",
                "candidates": [],
            },
            "catalog_match": None,
            "message": "Catalog review is not applicable to this approved service type.",
        }

    baseline = report_store.latest_open_assessment_for(target)
    if not baseline:
        audit_logger.record(
            event="metasploit_catalog_review_requested",
            target=target,
            decision="info",
        )
        return {
            "policy": policy_result,
            "scope": scope_result,
            "catalog": {
                "agent": "Metasploit Catalog Agent",
                "status": "not_needed",
                "reason": "No earlier OPEN assessment report exists for this target.",
                "candidates": [],
            },
            "catalog_match": None,
            "message": "Run an assessment with a verified open finding before reviewing a catalog.",
        }

    audit_logger.record(
        event="metasploit_catalog_review_requested",
        target=target,
        decision="allow",
    )
    catalog_result, catalog_match = _review_validation_catalog(
        target, baseline.get("findings", [])
    )
    return {
        "policy": policy_result,
        "scope": scope_result,
        "baseline_report_id": baseline["report_id"],
        "finding": baseline["findings"][0],
        "catalog": catalog_result,
        "catalog_match": catalog_match,
        "execution": "disabled",
        "message": "Catalog review completed. AEGIS did not launch a Metasploit module.",
    }


@app.get("/reports/{report_id}")
def get_report(report_id: str):
    report_path = report_store.path_for(report_id)
    if not report_path or not report_path.exists():
        return {"error": "Assessment report was not found."}

    return FileResponse(report_path, media_type="text/markdown", filename=report_path.name)

@app.get("/simulate-transfer")
def simulate_transfer(destination: str = "external.example"):
    marker = "SIMULATION_ONLY_EXPOSED_MARKER"

    policy_result = transfer_guardian.check_transfer(
        destination,
        marker
    )

    if not policy_result["allowed"]:
        audit_logger.record(
            event="transfer_requested",
            target=destination,
            decision="block"
        )

        return {
            "transfer_policy": policy_result,
            "transfer_sent": False,
            "message": "Transfer was blocked. No network request was made."
        }

    transfer_result = local_audit_client.send_lab_marker(marker)

    audit_logger.record(
        event="local_transfer_requested",
        target=destination,
        decision="allow" if transfer_result["sent"] else "error"
    )

    return {
        "transfer_policy": policy_result,
        "transfer_result": transfer_result
    }
