const resultTitle = document.querySelector("#result-title");
const resultState = document.querySelector("#result-state");
const resultOutput = document.querySelector("#result-output");
const resultReport = document.querySelector("#result-report");
const resultReportLink = document.querySelector("#result-report-link");
const promptState = document.querySelector("#prompt-state");
const promptOutput = document.querySelector("#prompt-output");
const auditList = document.querySelector("#audit-list");
const assessmentTarget = document.querySelector("#assessment-target");
const targetName = document.querySelector("#target-name");
const targetDetails = document.querySelector("#target-details");
const assessmentDescription = document.querySelector("#assessment-description");
const retestButton = document.querySelector("#retest-button");
const retestDescription = document.querySelector("#retest-description");
const catalogButton = document.querySelector("#catalog-button");
const assessmentButton = document.querySelector("#assessment-button");
const discoverLabsButton = document.querySelector("#discover-labs-button");
const pendingLabSelect = document.querySelector("#pending-lab-select");
const approveLabButton = document.querySelector("#approve-lab-button");
const registryStatus = document.querySelector("#registry-status");
const modelRoleSummary = document.querySelector("#model-role-summary");
const modelRoleDetails = document.querySelector("#model-role-details");
const triageModelSelect = document.querySelector("#triage-model-select");
const analysisModelSelect = document.querySelector("#analysis-model-select");
const applyModelsButton = document.querySelector("#apply-models-button");
const modelConfigStatus = document.querySelector("#model-config-status");

let approvedTargets = {};

function selectedTarget() {
  return assessmentTarget.value;
}

function updateSelectedTarget() {
  const target = selectedTarget();
  const targetMeta = approvedTargets[target];

  if (!targetMeta) {
    targetName.textContent = "No approved lab";
    targetDetails.textContent = "Discover then approve a labeled loopback Docker lab.";
    assessmentDescription.textContent = "Discover and approve a local Docker lab first";
    retestDescription.textContent = "Retest needs an approved Redis lab";
    assessmentButton.disabled = true;
    retestButton.disabled = true;
    catalogButton.disabled = true;
    return;
  }

  targetName.textContent = target;
  targetDetails.textContent = targetMeta.details;
  assessmentDescription.textContent = targetMeta.assessmentDescription;
  retestDescription.textContent = targetMeta.retestDescription;
  assessmentButton.disabled = false;
  retestButton.disabled = targetMeta.service !== "redis";
  retestButton.title = retestButton.disabled
    ? "Retest is available only for an approved Redis authentication-remediation lab."
    : "";
  catalogButton.disabled = targetMeta.service !== "redis";
  catalogButton.title = catalogButton.disabled
    ? "Catalog review is registered only for an approved Redis authentication lab."
    : "";
}

function targetOptionLabel(target) {
  return `${target.id} · ${target.description} · ${target.host}:${target.port}`;
}

function updateTargetSelect(targets) {
  const previousTarget = selectedTarget();
  approvedTargets = Object.fromEntries(targets.map((target) => [target.id, {
    ...target,
    details: `Docker registry · ${target.host}:${target.port}`,
    assessmentDescription: target.service === "redis"
      ? "Discover and verify the approved Redis authentication lab"
      : "Discover the approved local HTTP service only",
    retestDescription: target.service === "redis"
      ? "Confirm whether the approved Redis finding is fixed"
      : "Retest applies to an approved Redis authentication lab only",
  }]));

  assessmentTarget.replaceChildren();
  if (!targets.length) {
    assessmentTarget.add(new Option("Discover and approve a local Docker lab first", ""));
    assessmentTarget.disabled = true;
  } else {
    for (const target of targets) {
      assessmentTarget.add(new Option(targetOptionLabel(target), target.id));
    }
    assessmentTarget.disabled = false;
    assessmentTarget.value = approvedTargets[previousTarget] ? previousTarget : targets[0].id;
  }
  updateSelectedTarget();
}

function updatePendingSelect(targets) {
  pendingLabSelect.replaceChildren();
  if (!targets.length) {
    pendingLabSelect.add(new Option("No pending lab", ""));
    pendingLabSelect.disabled = true;
    approveLabButton.disabled = true;
    return;
  }
  for (const target of targets) {
    pendingLabSelect.add(new Option(targetOptionLabel(target), target.id));
  }
  pendingLabSelect.disabled = false;
  approveLabButton.disabled = false;
}

async function refreshTargetRegistry() {
  try {
    const data = await callApi("/targets");
    updateTargetSelect(data.approved || []);
    updatePendingSelect(data.pending || []);
    registryStatus.textContent = `${(data.approved || []).length} approved, ${(data.pending || []).length} pending local Docker lab(s).`;
  } catch (error) {
    updateTargetSelect([]);
    updatePendingSelect([]);
    registryStatus.textContent = `Could not read the local target registry: ${error.message}`;
  }
}

function setResult(title, state, data) {
  resultTitle.textContent = title;
  resultState.textContent = state;
  resultState.className = `result-state ${state.toLowerCase()}`;
  resultOutput.textContent = JSON.stringify(data, null, 2);

  if (data.report?.download_url) {
    resultReportLink.href = data.report.download_url;
    resultReport.hidden = false;
  } else {
    resultReport.hidden = true;
  }
}

async function callApi(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "The local API returned an error.");
  }

  return data;
}

function setLoading(title) {
  resultTitle.textContent = title;
  resultState.textContent = "WORKING";
  resultState.className = "result-state working";
  resultOutput.textContent = "The local agents are processing this laboratory action…";
}

function setPromptResult(state, data) {
  promptState.textContent = state;
  promptState.className = `result-state ${state.toLowerCase()}`;
  promptOutput.textContent = JSON.stringify(data, null, 2);
}

function setPromptLoading() {
  promptState.textContent = "CHECKING";
  promptState.className = "result-state working";
  promptOutput.textContent = "Prompt Guard is evaluating the message before local LLM access…";
}

async function refreshAudit() {
  try {
    const data = await callApi("/audit");
    const entries = [...data.entries].slice(-6).reverse();
    auditList.innerHTML = "";

    if (!entries.length) {
      auditList.innerHTML = '<li class="empty-audit">No decisions recorded yet.</li>';
      return;
    }

    for (const entry of entries) {
      const item = document.createElement("li");
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      item.innerHTML = `
        <span class="audit-decision ${entry.decision}">${entry.decision}</span>
        <div><strong>${entry.event.replaceAll("_", " ")}</strong><small>${entry.target} · ${timestamp}</small></div>
      `;
      auditList.appendChild(item);
    }
  } catch (error) {
    auditList.innerHTML = `<li class="empty-audit">Could not load audit events: ${error.message}</li>`;
  }
}

function setModelOptions(select, models, selectedModel) {
  select.replaceChildren();
  for (const model of models) {
    const option = new Option(model, model, false, model === selectedModel);
    select.add(option);
  }
}

function renderModelConfig(config, message = "") {
  const roles = config.roles || {};
  const models = config.available_models || [];
  const readyForSwitching = config.status === "ready" && config.runtime_switching;

  modelRoleSummary.textContent = roles.nmap_triage && roles.final_analysis
    ? `${roles.nmap_triage} → ${roles.final_analysis}`
    : "Local models unavailable";
  modelRoleDetails.textContent = roles.semantic_guard
    ? `Triage → analysis · Guard fixed: ${roles.semantic_guard}`
    : "Ollama must be running to load model roles.";

  if (models.length) {
    setModelOptions(triageModelSelect, models, roles.nmap_triage);
    setModelOptions(analysisModelSelect, models, roles.final_analysis);
  }

  triageModelSelect.disabled = !readyForSwitching;
  analysisModelSelect.disabled = !readyForSwitching;
  applyModelsButton.disabled = !readyForSwitching;
  modelConfigStatus.textContent = message || config.switching_scope || config.reason || "Local model configuration is unavailable.";
}

async function refreshModelConfig() {
  modelConfigStatus.textContent = "Checking the local Ollama model list…";
  try {
    const config = await callApi("/model-config");
    renderModelConfig(config);
  } catch (error) {
    renderModelConfig({ status: "unavailable", available_models: [], roles: {} }, `Could not load local models: ${error.message}`);
  }
}

applyModelsButton.addEventListener("click", async () => {
  modelConfigStatus.textContent = "Applying local model roles…";
  applyModelsButton.disabled = true;
  try {
    const data = await callApi(
      `/model-config?triage_model=${encodeURIComponent(triageModelSelect.value)}&analysis_model=${encodeURIComponent(analysisModelSelect.value)}`,
      { method: "POST" },
    );
    renderModelConfig(data, data.message || data.reason);
  } catch (error) {
    modelConfigStatus.textContent = `Could not apply roles: ${error.message}`;
  }
  refreshAudit();
});

discoverLabsButton.addEventListener("click", async () => {
  setLoading("Discovering opt-in local Docker labs");
  try {
    const data = await callApi("/discover-local-labs", { method: "POST" });
    setResult("Docker lab discovery completed", data.status?.toUpperCase() || "ERROR", data);
    registryStatus.textContent = data.reason || "Docker discovery completed.";
  } catch (error) {
    setResult("Docker lab discovery failed", "ERROR", { error: error.message });
  }
  await refreshTargetRegistry();
  refreshAudit();
});

approveLabButton.addEventListener("click", async () => {
  const targetId = pendingLabSelect.value;
  if (!targetId) {
    return;
  }
  setLoading("Approving the selected local Docker lab");
  try {
    const data = await callApi(
      `/approve-local-lab?target_id=${encodeURIComponent(targetId)}`,
      { method: "POST" },
    );
    setResult("Local Docker lab approved", data.status?.toUpperCase() || "ERROR", data);
  } catch (error) {
    setResult("Local lab approval failed", "ERROR", { error: error.message });
  }
  await refreshTargetRegistry();
  refreshAudit();
});

document.querySelector("#assessment-button").addEventListener("click", async () => {
  setLoading("Running constrained local Nmap assessment");
  try {
    const data = await callApi(`/run-assessment?target=${encodeURIComponent(selectedTarget())}`);
    const state = data.report?.assessment_state || "ERROR";
    setResult(
      state === "OPEN"
        ? "Open laboratory finding verified"
        : state === "NO_FINDING"
          ? "Approved web service observed"
          : "Assessment completed",
      state,
      data,
    );
  } catch (error) {
    setResult("Assessment failed", "ERROR", { error: error.message });
  }
  refreshAudit();
});

document.querySelector("#blocked-transfer-button").addEventListener("click", async () => {
  setLoading("Testing external-transfer policy");
  try {
    const data = await callApi("/simulate-transfer?destination=external.example");
    setResult("External transfer blocked", "BLOCK", data);
  } catch (error) {
    setResult("Transfer test failed", "ERROR", { error: error.message });
  }
  refreshAudit();
});

document.querySelector("#local-transfer-button").addEventListener("click", async () => {
  setLoading("Sending fictitious data to local audit");
  try {
    const data = await callApi("/simulate-transfer?destination=local_audit");
    setResult("Local audit transfer completed", "ALLOW", data);
  } catch (error) {
    setResult("Local transfer failed", "ERROR", { error: error.message });
  }
  refreshAudit();
});

document.querySelector("#retest-button").addEventListener("click", async () => {
  setLoading("Running local remediation retest");
  try {
    const data = await callApi(`/retest?target=${encodeURIComponent(selectedTarget())}`);
    setResult("Remediation retest completed", data.retest.status, data);
  } catch (error) {
    setResult("Retest failed", "ERROR", { error: error.message });
  }
  refreshAudit();
});

catalogButton.addEventListener("click", async () => {
  setLoading("Reviewing the controlled local validation catalog");
  try {
    const data = await callApi(`/catalog-review?target=${encodeURIComponent(selectedTarget())}`);
    const status = data.catalog?.status || "ERROR";
    const state = status === "completed" ? "CATALOG" : status.toUpperCase();
    const title = status === "completed"
      ? "Controlled validation catalog reviewed"
      : status === "unavailable"
        ? "Local Metasploit catalog unavailable"
        : "Catalog review completed";
    setResult(title, state, data);
  } catch (error) {
    setResult("Catalog review failed", "ERROR", { error: error.message });
  }
  refreshAudit();
});

document.querySelector("#prompt-button").addEventListener("click", async () => {
  const message = document.querySelector("#prompt-input").value.trim();

  if (!message) {
    setPromptResult("ERROR", { error: "The prompt cannot be empty." });
    return;
  }

  setPromptLoading();
  try {
    const data = await callApi(`/safe-llm?message=${encodeURIComponent(message)}`);
    setPromptResult(
      data.guard.decision.toUpperCase(),
      data,
    );
  } catch (error) {
    setPromptResult("ERROR", { error: error.message });
  }
  refreshAudit();
});

document.querySelector("#refresh-audit-button").addEventListener("click", refreshAudit);
assessmentTarget.addEventListener("change", updateSelectedTarget);
updateSelectedTarget();
refreshAudit();
refreshModelConfig();
refreshTargetRegistry();
