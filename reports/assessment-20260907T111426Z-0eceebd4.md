# AEGIS Local Assessment Report

## Scope

- Report ID: `assessment-20260907T111426Z-0eceebd4`
- Created: `2026-09-07T11:14:26.625911+00:00`
- Mode: `assessment`
- Target: `web-lab`
- Assessment state: **NO_FINDING**

## Ethical scope decision

Target is an approved loopback-only Docker laboratory service.

## Nmap local-service-discovery result

- 8082/tcp — open — http Uvicorn

## Local Nmap triage

Model: `llama3.2:1b`

The port 8082 is observed in use, and the service "http" is in a "open" state, potentially indicating a web server is listening. The service "Uvicorn" is running, suggesting a Python web framework is at play.

## Verified findings

No verified open finding.

## Verification result

The approved local FastAPI web service responded to its lab-status endpoint. This is service discovery only, not a vulnerability claim.

## Defensive recommendation

The approved web service was observed. No vulnerability was asserted and no LLM remediation was requested.

## Controlled validation catalog

Status: **not_needed**

No verified open finding requires a catalog review.

- No catalog candidate was reviewed.

## Local LLM catalog match

No model catalog match was generated.

## Retest guidance

Apply the remediation manually in the approved local lab. Then run AEGIS retest and compare the new assessment state with this report.
