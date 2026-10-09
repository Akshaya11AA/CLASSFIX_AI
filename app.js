
(() => {
  "use strict";

  const CONFIG = window.CLASSFIX_CONFIG || {};
  const ADMIN_EMAIL = (CONFIG.adminEmail || "admin123@gmail.com").toLowerCase();
  const $ = id => document.getElementById(id);

  const views = [
    "welcome-view",
    "auth-view",
    "admin-login-view",
    "student-view",
    "admin-view"
  ];

  let supabase = null;
  let session = null;
  let currentMode = "signin";
  let allIssues = [];
  let toastTimer = null;

  const configured =
    Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) &&
    !String(CONFIG.supabaseUrl).includes("YOUR_SUPABASE") &&
    !String(CONFIG.supabaseAnonKey).includes("YOUR_SUPABASE");

  if (configured && window.supabase) {
    supabase = window.supabase.createClient(
      CONFIG.supabaseUrl,
      CONFIG.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
  }

  function showView(viewId) {
    views.forEach(id => $(id).classList.toggle("hidden", id !== viewId));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function message(id, text, type = "") {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = "message" + (type ? " " + type : "");
  }

  function toast(text) {
    const el = $("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
  }

  function setBusy(button, busy, text) {
    if (!button) return;
    button.disabled = busy;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = text || "Please wait...";
    } else if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function classifyPriority(urgency, category, title, description) {
    const text = `${category} ${title} ${description}`.toLowerCase();

    if (urgency === "Critical" ||
        /smoke|fire|electric shock|sparking|exposed wire|gas leak/.test(text)) {
      return "Critical";
    }

    if (urgency === "High" ||
        /not working|broken|unsafe|leak|short circuit/.test(text)) {
      return "High";
    }

    if (urgency === "Low") return "Low";
    return "Medium";
  }

  function statusClass(status) {
    return String(status || "").replace(/\s+/g, ".");
  }

  function priorityBadge(priority) {
    return `<span class="priority ${escapeHTML(priority)}">${escapeHTML(priority)}</span>`;
  }

  function statusBadge(status) {
    return `<span class="status ${escapeHTML(statusClass(status))}">${escapeHTML(status)}</span>`;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short"
        });
  }

  function updateConnection() {
    $("connection-status").textContent = configured
      ? "● Cloud backend configured"
      : "● Backend not configured";
    $("connection-status").classList.toggle("offline", !configured);
  }

  function showStudentAuth() {
    currentMode = "signin";
    $("auth-heading").textContent = "Student & staff portal";
    $("auth-description").textContent =
      "Sign in to report a classroom issue and track your own submissions.";
    $("auth-tabs").classList.remove("hidden");
    $("auth-form").reset();
    updateAuthTabs();
    message("auth-message", "");
    showView("auth-view");
  }

  function showAdminLogin() {
    $("admin-form").reset();
    $("admin-email").value = ADMIN_EMAIL;
    message("admin-message", "");
    showView("admin-login-view");
  }

  function updateAuthTabs() {
    document.querySelectorAll(".tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.mode === currentMode);
    });

    $("auth-submit").textContent =
      currentMode === "signup" ? "Create account →" : "Sign in →";

    $("auth-password").autocomplete =
      currentMode === "signup" ? "new-password" : "current-password";
  }

  async function getCurrentSession() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function handleSession(nextSession) {
    session = nextSession;
    const user = nextSession?.user;
    $("logout-btn").classList.toggle("hidden", !user);

    if (!user) {
      showView("welcome-view");
      return;
    }

    const email = (user.email || "").toLowerCase();

    if (email === ADMIN_EMAIL) {
      $("signed-admin-email").textContent = user.email;
      showView("admin-view");
      await loadAdminIssues();
    } else {
      $("student-email").textContent = user.email || "Signed-in user";
      $("issue-form").reset();
      resetPhotoPreview();
      message("issue-message", "");
      showView("student-view");
      await loadMyIssues();
    }
  }

  async function signOut() {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast("Sign out failed: " + error.message);
        return;
      }
    }
    session = null;
    $("logout-btn").classList.add("hidden");
    showView("welcome-view");
    toast("Signed out successfully.");
  }

  // Navigation
  $("student-start-btn").addEventListener("click", showStudentAuth);
  $("admin-start-btn").addEventListener("click", showAdminLogin);
  $("back-home-btn").addEventListener("click", () => showView("welcome-view"));
  $("admin-back-btn").addEventListener("click", () => showView("welcome-view"));
  $("home-link").addEventListener("click", event => {
    event.preventDefault();
    if (session) handleSession(session);
    else showView("welcome-view");
  });
  $("logout-btn").addEventListener("click", signOut);

  // Email/password auth
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      currentMode = tab.dataset.mode;
      updateAuthTabs();
      message("auth-message", "");
    });
  });

  $("auth-form").addEventListener("submit", async event => {
    event.preventDefault();

    if (!supabase) {
      message("auth-message", "Backend not configured. Update config.js first.", "error");
      return;
    }

    const email = $("auth-email").value.trim().toLowerCase();
    const password = $("auth-password").value;
    const button = $("auth-submit");

    if (email === ADMIN_EMAIL) {
      message("auth-message", "Please use the restricted Admin Portal for this account.", "error");
      return;
    }

    setBusy(button, true, "Connecting...");

    try {
      let result;

      if (currentMode === "signup") {
        result = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin
          }
        });
      } else {
        result = await supabase.auth.signInWithPassword({ email, password });
      }

      if (result.error) throw result.error;

      if (currentMode === "signup" && !result.data.session) {
        message(
          "auth-message",
          "Account created. Check your email for the confirmation link, then sign in.",
          "success"
        );
        return;
      }

      if (result.data.session) {
        await handleSession(result.data.session);
        toast(currentMode === "signup" ? "Account created." : "Signed in.");
      }
    } catch (error) {
      message("auth-message", error.message || "Authentication failed.", "error");
    } finally {
      setBusy(button, false);
    }
  });

  // Google OAuth
  $("google-btn").addEventListener("click", async () => {
    if (!supabase) {
      message("auth-message", "Backend not configured. Update config.js first.", "error");
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (error) {
      message("auth-message", error.message || "Google sign-in failed.", "error");
    }
  });

  // Admin sign-in
  $("admin-form").addEventListener("submit", async event => {
    event.preventDefault();

    if (!supabase) {
      message("admin-message", "Real admin sign-in is not configured. Update config.js and complete SETUP.md.", "error");
      return;
    }

    const email = $("admin-email").value.trim().toLowerCase();
    const password = $("admin-password").value;
    const button = $("admin-submit");

    if (email !== ADMIN_EMAIL) {
      message("admin-message", "Access denied. This email is not an authorized administrator.", "error");
      return;
    }

    setBusy(button, true, "Verifying...");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if ((data.user?.email || "").toLowerCase() !== ADMIN_EMAIL) {
        await supabase.auth.signOut();
        throw new Error("This account is not authorized for administrator access.");
      }

      await handleSession(data.session);
      toast("Admin signed in.");
    } catch (error) {
      message("admin-message", error.message || "Admin sign-in failed.", "error");
    } finally {
      setBusy(button, false);
    }
  });

  // Image upload UI
  function resetPhotoPreview() {
    $("photo").value = "";
    $("file-name").textContent = "JPG, PNG or WEBP · max 5 MB";
    $("photo-preview").removeAttribute("src");
    $("photo-preview").classList.add("hidden");
  }

  $("photo").addEventListener("change", () => {
    const file = $("photo").files[0];
    const preview = $("photo-preview");

    if (!file) {
      resetPhotoPreview();
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"].includes(file.type);

    if (!allowed || file.size > 5 * 1024 * 1024) {
      message("issue-message", "Choose a JPG, PNG, or WEBP image smaller than 5 MB.", "error");
      resetPhotoPreview();
      return;
    }

    $("file-name").textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
    preview.src = URL.createObjectURL(file);
    preview.classList.remove("hidden");
    message("issue-message", "");
  });

  async function uploadPhoto(file, userId) {
    if (!file) return null;

    const allowed = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (!allowed || file.size > 5 * 1024 * 1024) {
      throw new Error("Photo must be JPG, PNG, or WEBP and no larger than 5 MB.");
    }

    const extension = file.type === "image/jpeg" ? "jpg" :
      file.type === "image/png" ? "png" : "webp";

    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from(CONFIG.photoBucket || "issue-photos")
      .upload(path, file, {
        contentType: file.type,
        upsert: false
      });

    if (error) throw error;
    return path;
  }

  
  // Submit a classroom issue with duplicate prevention
  $("issue-form").addEventListener("submit", async event => {
    event.preventDefault();

    if (!supabase || !session?.user) {
      message("issue-message", "Please sign in before submitting a report.", "error");
      return;
    }

    const user = session.user;

    if ((user.email || "").toLowerCase() === ADMIN_EMAIL) {
      message("issue-message", "Use a student or staff account to submit a report.", "error");
      return;
    }

    const title = $("title").value.trim();
    const description = $("description").value.trim();
    const category = $("category").value;
    const urgency = $("urgency").value;
    const building = $("building").value.trim();
    const room = $("room").value.trim();
    const file = $("photo").files[0] || null;
    const priority = classifyPriority(urgency, category, title, description);
    const button = $("issue-submit");
    let photoPath = null;

    if (!title || !description || !category || !building || !room) {
      message("issue-message", "Please complete all required fields.", "error");
      return;
    }

    setBusy(button, true, "Checking issue...");

    try {
      if (file) {
        photoPath = await uploadPhoto(file, user.id);
      }

      const { data, error } = await supabase.rpc(
        "submit_issue_deduplicated",
        {
          p_title: title,
          p_building: building,
          p_room: room,
          p_category: category,
          p_urgency: urgency,
          p_priority: priority,
          p_description: description,
          p_photo_path: photoPath
        }
      );

      if (error) throw error;

      if (data.duplicate) {
        if (photoPath) {
          const { error: removeError } = await supabase.storage
            .from(CONFIG.photoBucket || "issue-photos")
            .remove([photoPath]);

          if (removeError) {
            console.warn("Unused photo cleanup failed:", removeError.message);
          }
        }

        message(
          "issue-message",
          `This issue is already recorded. Tracking ID: ${data.tracking_id}. No duplicate report was created.`,
          "success"
        );

        toast(`Already reported: ${data.tracking_id}`);
        return;
      }

      $("issue-form").reset();
      resetPhotoPreview();

      message(
        "issue-message",
        `Report submitted successfully. Tracking ID: ${data.tracking_id}.`,
        "success"
      );

      toast("Report submitted successfully.");
      await loadMyIssues();

    } catch (error) {
      console.error("Issue submission failed:", error);

      message(
        "issue-message",
        error.message || "Could not submit report. Please try again.",
        "error"
      );
    } finally {
      setBusy(button, false);
    }
  });

  // Signed URLs are short-lived and only requested for the signed-in user or admin.
  async function photoLink(path) {
    if (!path) return "";
    const { data, error } = await supabase.storage
      .from(CONFIG.photoBucket || "issue-photos")
      .createSignedUrl(path, 300);

    if (error) return "";
    return data.signedUrl;
  }

  async function loadMyIssues() {
    if (!supabase || !session?.user) return;

    const list = $("my-reports");
    list.innerHTML = '<div class="empty-state">Loading your reports...</div>';

    const { data, error } = await supabase
      .from("issues")
      .select("id,tracking_id,title,building,room,category,priority,status,created_at,updated_at,completed_at,resolution_note,photo_path")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      list.innerHTML = '<div class="empty-state">Unable to load reports.</div>';
      return;
    }

    if (!data.length) {
      list.innerHTML = '<div class="empty-state">You have not submitted any reports yet.</div>';
      return;
    }

    list.innerHTML = data.map(issue => `
      <article class="report-item">
        <div class="report-item-top">
          <span class="tracking">${escapeHTML(issue.tracking_id)}</span>
          ${statusBadge(issue.status)}
        </div>
        <strong>${escapeHTML(issue.title)}</strong>
        <p>${escapeHTML(issue.building)} · Room ${escapeHTML(issue.room)}</p>
        <div class="report-item-bottom">
          ${priorityBadge(issue.priority)}
          <small>${escapeHTML(formatDate(issue.created_at))}</small>
        </div>
        ${issue.resolution_note ? `<p class="resolution-note"><b>Resolution:</b> ${escapeHTML(issue.resolution_note)}</p>` : ""}
        ${issue.photo_path ? `<button class="text-button photo-open" data-path="${escapeHTML(issue.photo_path)}">View attached photo</button>` : ""}
      </article>
    `).join("");

    list.querySelectorAll(".photo-open").forEach(button => {
      button.addEventListener("click", async () => {
        const url = await photoLink(button.dataset.path);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        else toast("Unable to open photo.");
      });
    });
  }

  $("refresh-my-reports").addEventListener("click", loadMyIssues);

  // Admin data
  async function loadAdminIssues() {
    if (!supabase || !session?.user ||
        (session.user.email || "").toLowerCase() !== ADMIN_EMAIL) {
      return;
    }

    $("issues-table-body").innerHTML =
      '<tr><td colspan="7" class="empty-state">Loading reports...</td></tr>';

    const { data, error } = await supabase
      .from("issues")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      allIssues = [];
      $("issues-table-body").innerHTML =
        `<tr><td colspan="7" class="empty-state">${escapeHTML(error.message)}</td></tr>`;
      message("admin-message-dashboard", "Unable to load reports. Check database policies.", "error");
      updateStats();
      return;
    }

    allIssues = data || [];
    message("admin-message-dashboard", "");
    updateStats();
    renderAdminTable();
  }

  function updateStats() {
    const active = allIssues.filter(issue => issue.status !== "Completed");
    const completed = allIssues.filter(issue => issue.status === "Completed");
    const urgent = active.filter(issue => ["High", "Critical"].includes(issue.priority));

    $("stat-total").textContent = allIssues.length;
    $("stat-active").textContent = active.length;
    $("stat-urgent").textContent = urgent.length;
    $("stat-completed").textContent = completed.length;
    $("completed-summary-count").textContent = completed.length;
  }

  function renderAdminTable() {
    const query = $("search-issues").value.trim().toLowerCase();
    const status = $("filter-status").value;
    const priority = $("filter-priority").value;

    const filtered = allIssues.filter(issue => {
      const haystack = [
        issue.tracking_id, issue.title, issue.building, issue.room,
        issue.category, issue.reporter_email, issue.description
      ].join(" ").toLowerCase();

      return (!query || haystack.includes(query)) &&
        (status === "All" || issue.status === status) &&
        (priority === "All" || issue.priority === priority);
    });

    $("issue-count").textContent = `${filtered.length} issue${filtered.length === 1 ? "" : "s"}`;

    if (!filtered.length) {
      $("issues-table-body").innerHTML =
        '<tr><td colspan="7" class="empty-state">No matching issues found.</td></tr>';
      return;
    }

    $("issues-table-body").innerHTML = filtered.map(issue => `
      <tr>
        <td>
          <div class="issue-title">${escapeHTML(issue.title)}</div>
          <div class="issue-id">${escapeHTML(issue.tracking_id)}</div>
          <div class="issue-id">${escapeHTML(formatDate(issue.created_at))}</div>
          ${issue.photo_path ? `<button class="text-button admin-photo" data-path="${escapeHTML(issue.photo_path)}">View photo</button>` : ""}
        </td>
        <td><strong>${escapeHTML(issue.building)}</strong><div class="location-sub">Room ${escapeHTML(issue.room)}</div></td>
        <td>${escapeHTML(issue.category)}</td>
        <td>${priorityBadge(issue.priority)}</td>
        <td>${escapeHTML(issue.reporter_email)}</td>
        <td>
          <select class="status-select" data-id="${escapeHTML(issue.id)}" aria-label="Update status">
            ${["Submitted", "In Progress", "Completed"].map(s =>
              `<option value="${s}" ${issue.status === s ? "selected" : ""}>${s}</option>`
            ).join("")}
          </select>
          ${issue.assigned_to ? `<div class="location-sub">Assigned: ${escapeHTML(issue.assigned_to)}</div>` : ""}
        </td>
        <td><button class="btn btn-small btn-light edit-issue" data-id="${escapeHTML(issue.id)}">Manage</button></td>
      </tr>
    `).join("");

    $("issues-table-body").querySelectorAll(".status-select").forEach(select => {
      select.addEventListener("change", async () => {
        await updateIssue(select.dataset.id, { status: select.value });
      });
    });

    $("issues-table-body").querySelectorAll(".edit-issue").forEach(button => {
      button.addEventListener("click", () => manageIssue(button.dataset.id));
    });

    $("issues-table-body").querySelectorAll(".admin-photo").forEach(button => {
      button.addEventListener("click", async () => {
        const url = await photoLink(button.dataset.path);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        else toast("Unable to open photo.");
      });
    });
  }

  async function updateIssue(id, changes) {
    if (!session?.user ||
        (session.user.email || "").toLowerCase() !== ADMIN_EMAIL) {
      toast("Administrator access required.");
      return;
    }

    const payload = { ...changes, updated_at: new Date().toISOString() };

    if (changes.status === "Completed") {
      payload.completed_at = new Date().toISOString();
    } else if (changes.status) {
      payload.completed_at = null;
    }

    const { error } = await supabase
      .from("issues")
      .update(payload)
      .eq("id", id);

    if (error) {
      toast("Update failed: " + error.message);
      await loadAdminIssues();
      return;
    }

    toast("Issue updated.");
    await loadAdminIssues();
  }

  async function manageIssue(id) {
    const issue = allIssues.find(item => item.id === id);
    if (!issue) return;

    const assigned = prompt("Assign to staff member (leave blank to clear):", issue.assigned_to || "");
    if (assigned === null) return;

    const resolution = prompt("Resolution note (required before completing):", issue.resolution_note || "");
    if (resolution === null) return;

    const status = prompt(
      "Enter status exactly: Submitted, In Progress, or Completed",
      issue.status
    );

    if (!["Submitted", "In Progress", "Completed"].includes(status)) {
      toast("Invalid status. No changes saved.");
      return;
    }

    if (status === "Completed" && !resolution.trim()) {
      toast("Add a resolution note before completing an issue.");
      return;
    }

    await updateIssue(id, {
      assigned_to: assigned.trim() || null,
      resolution_note: resolution.trim() || null,
      status
    });
  }

  $("refresh-admin").addEventListener("click", loadAdminIssues);
  $("search-issues").addEventListener("input", renderAdminTable);
  $("filter-status").addEventListener("change", renderAdminTable);
  $("filter-priority").addEventListener("change", renderAdminTable);

  // CSV export
  function downloadCSV(filename, rows) {
    if (!rows.length) {
      toast("There are no issues to export.");
      return;
    }

    const columns = [
      ["Tracking ID", "tracking_id"],
      ["Title", "title"],
      ["Building", "building"],
      ["Room", "room"],
      ["Category", "category"],
      ["Urgency", "urgency"],
      ["Priority", "priority"],
      ["Description", "description"],
      ["Reporter Email", "reporter_email"],
      ["Status", "status"],
      ["Assigned To", "assigned_to"],
      ["Resolution Note", "resolution_note"],
      ["Reported At", "created_at"],
      ["Updated At", "updated_at"],
      ["Completed At", "completed_at"]
    ];

    const csvCell = value => {
      let text = String(value ?? "");
      // Avoid CSV formula injection in Excel.
      if (/^[=+\-@]/.test(text)) text = "'" + text;
      return `"${text.replace(/"/g, '""')}"`;
    };

    const lines = [
      columns.map(([label]) => csvCell(label)).join(","),
      ...rows.map(row => columns.map(([, key]) => csvCell(row[key])).join(","))
    ];

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("CSV report downloaded.");
  }

  function exportAll() {
    downloadCSV("classfix-all-issues.csv", allIssues);
  }

  function exportCompleted() {
    downloadCSV(
      "classfix-completed-issues.csv",
      allIssues.filter(issue => issue.status === "Completed")
    );
  }

  $("export-all").addEventListener("click", exportAll);
  $("export-completed").addEventListener("click", exportCompleted);
  $("export-summary").addEventListener("click", exportCompleted);

  // Initial setup
  updateConnection();

  if (!configured) {
    message(
      "admin-message",
      "Backend is not configured. Add your Supabase URL and public key to config.js, then complete SETUP.md.",
      "error"
    );
  }

  if (supabase) {
    supabase.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      // Defer async UI work to avoid blocking auth callback handling.
      setTimeout(() => handleSession(nextSession).catch(error => {
        console.error(error);
        toast("Unable to load portal data.");
      }), 0);
    });

    getCurrentSession()
      .then(nextSession => handleSession(nextSession))
      .catch(error => {
        console.error(error);
        showView("welcome-view");
      });
  } else {
    showView("welcome-view");
  }
})();