// Add a repeatable entry (education, experience, project) from its <template>.
// Returns the newly created entry element so callers can pre-fill it.
function addEntry(type) {
  const template = document.getElementById(`${type}-template`);
  const list = document.getElementById(`${type}-list`);
  const clone = template.content.cloneNode(true);
  list.appendChild(clone);

  const entry = list.lastElementChild;

  // Seed entries that support metrics with one empty metric row.
  const metricList = entry.querySelector("[data-metric-list]");
  if (metricList) addMetric(metricList);

  return entry;
}

// Add a single metric row to a given metric list.
function addMetric(metricList) {
  const template = document.getElementById("metric-template");
  metricList.appendChild(template.content.cloneNode(true));
}

// Wire up section-level "+ Add" buttons (these exist at load time).
document.querySelectorAll(".btn-add[data-add]").forEach((btn) => {
  btn.addEventListener("click", () => addEntry(btn.dataset.add));
});

// Delegated clicks for dynamically created controls.
document.addEventListener("click", (e) => {
  const addMetricBtn = e.target.closest("[data-add-metric]");
  if (addMetricBtn) {
    addMetric(addMetricBtn.closest(".section-head").nextElementSibling);
    return;
  }

  const removeMetricBtn = e.target.closest("[data-remove-metric]");
  if (removeMetricBtn) {
    removeMetricBtn.closest(".metric-row").remove();
    return;
  }

  const removeBtn = e.target.closest("[data-remove]");
  if (removeBtn) {
    removeBtn.closest(".entry").remove();
  }
});

// Collect values from all entries of a given type.
function collectEntries(type) {
  return Array.from(
    document.querySelectorAll(`[data-entry="${type}"]`)
  ).map((entry) => {
    const data = {};
    entry.querySelectorAll("input, textarea").forEach((field) => {
      if (field.name === "metric") return; // collected separately as an array
      data[field.name] = field.value.trim();
    });
    const metricInputs = entry.querySelectorAll('[name="metric"]');
    if (metricInputs.length) {
      data.metrics = Array.from(metricInputs)
        .map((input) => input.value.trim())
        .filter(Boolean);
    }
    return data;
  });
}

// --- Form field helpers -------------------------------------------------------

// Set a field's value by name within a given root (defaults to the document).
function setField(name, value, root = document) {
  const field = root.querySelector(`[name="${name}"]`);
  if (field) field.value = value;
}

// Read a top-level field by its unique id. We must use ids (not form.<name>)
// because some basics names ("name", "location") also exist in the repeatable
// entry templates — form.<name> would return a RadioNodeList with value "".
function readField(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

// Fill a freshly created entry, including its first metric row if present.
function fillEntry(entry, values) {
  Object.entries(values).forEach(([name, value]) => {
    if (name === "metric") {
      const metric = entry.querySelector('[name="metric"]');
      if (metric) metric.value = value;
    } else {
      setField(name, value, entry);
    }
  });
}


// --- Result rendering: resume preview + download ------------------------------

const form = document.getElementById("resume-form");
const createBtn = document.getElementById("create-btn");
const result = document.getElementById("result");
const preview = document.getElementById("resume-preview");
const downloadBtn = document.getElementById("download-btn");

const progressBar = document.getElementById("progress-bar");
const progressPct = document.getElementById("progress-pct");

let resumeData = null;
let progressTimer = null;

function setLoading(isLoading) {
  createBtn.classList.toggle("is-loading", isLoading);
  createBtn.disabled = isLoading;
}

function setProgress(pct) {
  const value = Math.round(pct);
  progressBar.style.width = `${value}%`;
  progressPct.textContent = value;
}

// The Gemini call isn't streamed, so we can't know real progress. Ease the bar
// toward 90% while waiting, then snap to 100% the moment the response lands.
function startProgress() {
  clearInterval(progressTimer);
  let pct = 0;
  setProgress(0);
  progressTimer = setInterval(() => {
    pct += Math.max(0.6, (90 - pct) * 0.06); // decelerating creep
    if (pct >= 90) pct = 90;
    setProgress(pct);
  }, 200);
}

function stopProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
}

// Reveal the result card in its loading state (progress bar only, no thumbnail).
function showLoadingState() {
  resumeData = null;
  result.dataset.state = "loading";
  result.hidden = false;
  startProgress();
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// --- Render structured resume into the fixed template ----------------------
// Gemini returns structured JSON; we render it into HTML that mirrors the
// reference PDF layout. All dynamic values are escaped (injection-safe).

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Contact-line icons (inline SVG so they print and need no external assets).
const ICONS = {
  email:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 2-8 5L4 6h16zm0 12H4V8l8 5 8-5v10z"/></svg>',
  phone:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>',
  linkedin:
    '<svg viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.34 18.34V9.99H5.67v8.35h2.67zM7 8.81a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1zm11.34 9.53v-4.57c0-2.45-1.31-3.59-3.06-3.59-1.41 0-2.04.78-2.39 1.32V9.99h-2.67v8.35h2.67v-4.66c0-.25.02-.49.09-.67.2-.49.65-1 1.4-1 .99 0 1.39.75 1.39 1.85v4.48h2.57z"/></svg>',
  link:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z"/></svg>',
  github:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.11-.76.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.42.36.79 1.08.79 2.18v3.23c0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>',
};

// Prepend https:// to a bare URL so the link is clickable; display text as-is.
function hrefFor(url) {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

function contactItem(icon, text) {
  if (!text || !text.trim()) return "";
  const value = text.trim();
  const isUrl = /\.|\//.test(value) && !value.includes("@");
  const inner = isUrl
    ? `<a href="${esc(hrefFor(value))}" target="_blank" rel="noopener">${esc(value)}</a>`
    : esc(value);
  return `<span class="r-contact-item">${icon}${inner}</span>`;
}

// "Left title | right meta" header row used by education and experience.
function entryHead(titleHtml, metaParts) {
  const meta = metaParts.filter((p) => p && p.trim()).map(esc).join(" | ");
  const right = meta ? `<span class="r-entry-meta">${meta}</span>` : "";
  return `<div class="r-entry-head"><span class="r-entry-title">${titleHtml}</span>${right}</div>`;
}

function bulletsHtml(bullets) {
  if (!bullets || !bullets.length) return "";
  const items = bullets
    .filter((b) => b && b.trim())
    .map((b) => `<li>${esc(b)}</li>`)
    .join("");
  return items ? `<ul class="r-bullets">${items}</ul>` : "";
}

function section(title, body) {
  if (!body || !body.trim()) return "";
  return `<section class="r-section"><h2 class="r-section-title">${esc(title)}</h2>${body}</section>`;
}

function renderResume(data) {
  const c = data.contact || {};

  const line1 = [
    contactItem(ICONS.email, c.email),
    contactItem(ICONS.phone, c.phone),
    contactItem(ICONS.linkedin, c.linkedin),
  ].join("");
  const line2 = [
    contactItem(ICONS.link, c.website),
    contactItem(ICONS.github, c.github),
  ].join("");

  const header =
    `<h1 class="r-name">${esc(data.name)}</h1>` +
    (line1 ? `<div class="r-contact">${line1}</div>` : "") +
    (line2 ? `<div class="r-contact">${line2}</div>` : "");

  const education = (data.education || [])
    .map((e) => {
      const title =
        `<strong>${esc(e.degree)},</strong>` +
        (e.institution ? ` <em>${esc(e.institution)}</em>` : "");
      return (
        `<div class="r-entry">` +
        entryHead(title, [e.location, e.years]) +
        bulletsHtml(e.details) +
        `</div>`
      );
    })
    .join("");

  const skills = (data.skills || []).filter((s) => s && s.trim());
  const skillsBody = skills.length
    ? `<p class="r-skills">${esc(skills.join(", "))}</p>`
    : "";

  const experience = (data.experience || [])
    .map((x) => {
      const title =
        `<strong>${esc(x.role)},</strong>` +
        (x.company ? ` <em>${esc(x.company)}</em>` : "");
      return (
        `<div class="r-entry">` +
        entryHead(title, [x.location, x.timeline]) +
        bulletsHtml(x.bullets) +
        `</div>`
      );
    })
    .join("");

  const projects = (data.projects || [])
    .map(
      (p) =>
        `<div class="r-entry">` +
        `<div class="r-entry-head"><span class="r-entry-title"><strong>${esc(p.name)}</strong></span></div>` +
        bulletsHtml(p.bullets) +
        `</div>`
    )
    .join("");

  return (
    `<div class="r-header">${header}</div>` +
    section("Education", education) +
    section("Technical Skills", skillsBody) +
    section("Work Experience", experience) +
    section("Projects", projects)
  );
}

// Populate and switch to the finished resume + download button.
function showResult(data) {
  resumeData = data;
  preview.innerHTML = renderResume(data);
  result.dataset.state = "ready";
}

// Hide the result card entirely (e.g. on error) so no empty preview shows.
function hideResult() {
  stopProgress();
  result.hidden = true;
  result.dataset.state = "";
}

// "Download resume" -> print the formatted resume to PDF. A hidden, same-origin
// iframe loads styles.css (so the @media print rules apply) and triggers print;
// the browser's "Save as PDF" destination produces the file.
downloadBtn.addEventListener("click", () => {
  if (!resumeData) return;

  const name = readField("name") || "Resume";
  const html = renderResume(resumeData);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<title>${esc(name)} – Resume</title>` +
      `<link rel="stylesheet" href="styles.css"></head>` +
      `<body class="print-body"><div class="resume-page">${html}</div></body></html>`
  );
  doc.close();

  // Wait for the stylesheet to load before printing, then clean up.
  iframe.addEventListener("load", () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 1000);
  });
});

// --- Form validation --------------------------------------------------------

function wordCount(str) {
  const trimmed = str.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// Clear all previously shown validation messages.
function clearErrors() {
  document.querySelectorAll(".field-error").forEach((el) => el.remove());
  document
    .querySelectorAll(".invalid")
    .forEach((el) => el.classList.remove("invalid"));
}

// Mark a field invalid and show a message beneath it.
function showError(field, message, firstRef) {
  field.classList.add("invalid");
  const msg = document.createElement("p");
  msg.className = "field-error";
  msg.textContent = message;
  field.insertAdjacentElement("afterend", msg);
  if (!firstRef.el) firstRef.el = field;
}

// Validate the whole form. Returns true if valid; otherwise shows messages,
// focuses the first problem, and returns false.
function validateForm() {
  clearErrors();
  const first = { el: null };
  const fail = (field, msg) => field && showError(field, msg, first);

  const requireText = (id, label) => {
    const el = document.getElementById(id);
    if (el && !el.value.trim()) fail(el, `${label} is required.`);
  };

  const requireEntryFields = (entry, fields) => {
    fields.forEach(([name, label]) => {
      const f = entry.querySelector(`[name="${name}"]`);
      if (f && !f.value.trim()) fail(f, `${label} is required.`);
    });
  };

  const requireMinWords = (field, min, label) => {
    if (!field) return;
    const count = wordCount(field.value);
    if (!field.value.trim()) fail(field, `${label} is required.`);
    else if (count < min)
      fail(field, `${label} must be at least ${min} words (currently ${count}).`);
  };

  const requireOneMetric = (entry) => {
    const filled = [...entry.querySelectorAll('[name="metric"]')].filter((m) =>
      m.value.trim()
    );
    if (!filled.length) {
      const list = entry.querySelector("[data-metric-list]");
      fail(list || entry, "Add at least one metric.");
    }
  };

  // Basics: only name, title, location, email are required.
  requireText("name", "Name");
  requireText("title", "Title");
  requireText("location", "Location");
  requireText("email", "Email");

  // Job posting: all fields required; posting text needs ≥ 300 words.
  requireText("job-title", "Title");
  requireText("job-company", "Company");
  requireMinWords(
    document.getElementById("job-description"),
    200,
    "Job posting text"
  );

  // Education (if added): all fields required except GPA.
  document.querySelectorAll('[data-entry="education"]').forEach((entry) => {
    requireEntryFields(entry, [
      ["degree", "Degree"],
      ["institution", "Institution"],
      ["years", "Years attended"],
    ]);
  });

  // Work experience (each): company/role/location/timeline, ≥100-word
  // description, and at least one metric.
  document.querySelectorAll('[data-entry="experience"]').forEach((entry) => {
    requireEntryFields(entry, [
      ["company", "Company"],
      ["role", "Role"],
      ["location", "Location"],
      ["timeline", "Timeline"],
    ]);
    requireMinWords(entry.querySelector('[name="description"]'), 50, "Description");
    requireOneMetric(entry);
  });

  // Projects (each): name, ≥50-word description, and at least one metric.
  document.querySelectorAll('[data-entry="project"]').forEach((entry) => {
    requireEntryFields(entry, [["name", "Project name"]]);
    requireMinWords(entry.querySelector('[name="description"]'), 50, "Description");
    requireOneMetric(entry);
  });

  if (first.el) {
    first.el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof first.el.focus === "function") first.el.focus({ preventScroll: true });
    return false;
  }
  return true;
}

// Clear a field's error as soon as the user edits it.
form.addEventListener("input", (e) => {
  const field = e.target;
  if (field.classList.contains("invalid")) {
    field.classList.remove("invalid");
    const next = field.nextElementSibling;
    if (next && next.classList.contains("field-error")) next.remove();
  }
});

// Build the resume object on submit and ask Gemini to tailor it.
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!validateForm()) return;

  const jobPosting = {
    title: readField("job-title"),
    company: readField("job-company"),
    description: readField("job-description"),
  };

  const resume = {
    name: readField("name"),
    title: readField("title"),
    location: readField("location"),
    phone: readField("phone"),
    email: readField("email"),
    linkedin: readField("linkedin"),
    website: readField("website"),
    github: readField("github"),
    education: collectEntries("education"),
    skills: readField("skills")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    experience: collectEntries("experience"),
    projects: collectEntries("project"),
  };

  const payload = { jobPosting, resume };

  setLoading(true);
  showLoadingState();
  try {
    const response = await fetch("/api/resume/match-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    // Surface server-side failures (e.g. 401/500) instead of an empty thumbnail.
    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    const r = data.resume;
    // A stale server (old code) returns the resume as a plain text string.
    if (typeof r === "string") {
      throw new Error(
        "The server is running old code (returned plain text). Stop every " +
          "running server, then start one fresh with `npm start`."
      );
    }
    if (!r || typeof r !== "object" || !r.name) {
      console.error("Unexpected resume payload:", data);
      throw new Error(
        "Gemini returned an empty or malformed resume — see the browser " +
          "console for the raw response."
      );
    }

    // Complete the bar and let the user see 100% before revealing the thumbnail.
    stopProgress();
    setProgress(100);
    await new Promise((resolve) => setTimeout(resolve, 400));

    showResult(r);
  } catch (err) {
    hideResult();
    alert(`Something went wrong generating the resume:\n\n${err.message}`);
    console.error(err);
  } finally {
    setLoading(false);
  }
});

// --- Fill with LinkedIn -------------------------------------------------------

const linkedinBtn = document.getElementById("linkedin-btn");
const linkedinFile = document.getElementById("linkedin-file");

function setLinkedinLoading(isLoading) {
  linkedinBtn.classList.toggle("is-loading", isLoading);
  linkedinBtn.disabled = isLoading;
}

// Wipe candidate data so an import starts clean. Leaves the Job posting section
// untouched (that's the target role, not part of the candidate's profile).
function clearForm() {
  [
    "name",
    "title",
    "location",
    "phone",
    "email",
    "linkedin",
    "website",
    "github",
    "skills",
  ].forEach((name) => setField(name, ""));

  ["education-list", "experience-list", "project-list"].forEach((id) => {
    const list = document.getElementById(id);
    if (list) list.querySelectorAll("[data-entry]").forEach((node) => node.remove());
  });

  clearErrors();
}

// fillEntry only sets the first metric row; this adds rows for any extras and
// fills every metric input in order.
function fillEntryWithMetrics(entry, values, metrics = []) {
  fillEntry(entry, values);
  const metricList = entry.querySelector("[data-metric-list]");
  for (let i = 1; i < metrics.length; i++) addMetric(metricList);
  const inputs = entry.querySelectorAll('[name="metric"]');
  metrics.forEach((m, i) => {
    if (inputs[i]) inputs[i].value = m;
  });
}

// Populate the form from an extracted LinkedIn profile (server response shape).
function populateFromProfile(profile) {
  const b = profile.basics || {};
  setField("name", b.name || "");
  setField("title", b.title || "");
  setField("location", b.location || "");
  setField("phone", b.phone || "");
  setField("email", b.email || "");
  setField("linkedin", b.linkedin || "");
  setField("website", b.website || "");
  setField("github", b.github || "");

  setField("skills", (profile.skills || []).join(", "));

  (profile.education || []).forEach((e) =>
    fillEntry(addEntry("education"), {
      degree: e.degree || "",
      gpa: e.gpa || "",
      institution: e.institution || "",
      years: e.years || "",
    })
  );

  (profile.experience || []).forEach((x) =>
    fillEntryWithMetrics(
      addEntry("experience"),
      {
        company: x.company || "",
        role: x.role || "",
        location: x.location || "",
        timeline: x.timeline || "",
        description: x.description || "",
      },
      x.metrics || []
    )
  );

  (profile.projects || []).forEach((p) =>
    fillEntryWithMetrics(
      addEntry("project"),
      { name: p.name || "", description: p.description || "" },
      p.metrics || []
    )
  );
}

// Read a File as a bare base64 string (drops the "data:...;base64," prefix).
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Failed to read the file."));
    reader.readAsDataURL(file);
  });
}

linkedinBtn.addEventListener("click", () => linkedinFile.click());

linkedinFile.addEventListener("change", async () => {
  const file = linkedinFile.files[0];
  if (!file) return;

  if (file.type !== "application/pdf") {
    alert("Please upload a PDF exported from LinkedIn.");
    linkedinFile.value = "";
    return;
  }

  setLinkedinLoading(true);
  try {
    const pdf = await readFileAsBase64(file);
    const response = await fetch("/api/resume/import-linkedin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdf }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    const profile = data.profile;
    if (!profile || typeof profile !== "object" || !profile.basics) {
      console.error("Unexpected profile payload:", data);
      throw new Error("Couldn't read any profile data from that PDF.");
    }

    // Only clear once we have a good response, so a failure never wipes data.
    clearForm();
    populateFromProfile(profile);
  } catch (err) {
    alert(`Couldn't import from LinkedIn:\n\n${err.message}`);
    console.error(err);
  } finally {
    setLinkedinLoading(false);
    linkedinFile.value = ""; // allow re-picking the same file
  }
});

// Start with one empty entry of each repeatable section so the fields are visible.
addEntry("education");
addEntry("experience");
addEntry("project");
