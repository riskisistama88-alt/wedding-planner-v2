/* ==========================================================================
   AURA SUPERADMIN SESSION GUARD
   ========================================================================== */
const currentUser = localStorage.getItem("AURA_USER");
if (!currentUser || currentUser.toLowerCase() !== "admin@aura.com") {
  window.location.href = "index.html";
}

function logout() {
  localStorage.removeItem("AURA_USER");
  window.location.href = "index.html";
}

/* ==========================================================================
   SUPERADMIN STATE & DATA ENGINE
   ========================================================================== */
let projects = [];
let selectedProjectId = null;
let editingProjectId = null;
let editingUserEmail = null;

// Seed data based on mockup screenshots
const SEED_PROJECTS = [
  {
    id: "WD-AURA-001",
    name: "Rachel & Kevin's Wedding",
    budget: 100000000,
    due_date: "2027-03-20",
    gas_url: "",
    users: [
      {
        email: "rachel.adriana@gmail.com",
        role: "CLIENT_DECIDER",
        label: "Decider (Rachel)",
        token: "2027",
        permissions: ["Vendor", "Budget", "Milestone", "Verify"]
      },
      {
        email: "kevin.pradana@gmail.com",
        role: "CLIENT_INITIATOR",
        label: "Initiator (Kevin)",
        token: "2027",
        permissions: ["Vendor"]
      }
    ]
  },
  {
    id: "WD-AURA-002",
    name: "Indah & Tama's Wedding",
    budget: 350000000,
    due_date: "2027-03-20",
    gas_url: "https://script.google.com/macros/s/dummy/exec",
    users: [
      {
        email: "tama.decider@sg-corp.com",
        role: "CLIENT_DECIDER",
        label: "Decider (Tama)",
        token: "270327",
        permissions: ["Vendor", "Budget", "Milestone", "Verify"]
      },
      {
        email: "indah.adr@gmail.com",
        role: "CLIENT_INITIATOR",
        label: "Initiator (Indah)",
        token: "270327",
        permissions: ["Vendor"]
      }
    ]
  }
];

window.onload = function() {
  // Load projects database
  const localProjects = localStorage.getItem("AURA_PROJECTS");
  if (localProjects) {
    projects = JSON.parse(localProjects);
  } else {
    projects = [...SEED_PROJECTS];
    localStorage.setItem("AURA_PROJECTS", JSON.stringify(projects));
  }

  // Set default selection to first project if available
  if (projects.length > 0) {
    selectedProjectId = projects[0].id;
  }

  calculateStats();
  renderProjects();
  renderRoles();
};

/* ==========================================================================
   CALCULATORS & STATS
   ========================================================================== */
function calculateStats() {
  const totalProjects = projects.length;
  
  let totalUsers = 0;
  let apiIntegrations = 0;

  projects.forEach(p => {
    totalUsers += p.users.length;
    if (p.gas_url) apiIntegrations++;
  });

  document.getElementById("stat-total-projects").innerText = totalProjects;
  document.getElementById("stat-total-users").innerText = totalUsers;
  document.getElementById("stat-api-integrations").innerText = apiIntegrations;
}

/* ==========================================================================
   RENDERERS
   ========================================================================== */
function renderProjects() {
  const tbody = document.getElementById("projects-tbody");
  tbody.innerHTML = "";

  if (projects.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-apple-muted48">
          Belum ada proyek client. Silakan klik 'Buat Proyek Baru'.
        </td>
      </tr>
    `;
    return;
  }

  projects.forEach(p => {
    const isSelected = p.id === selectedProjectId;
    const activeClass = isSelected ? "bg-blue-50/40 border-l-4 border-l-apple-primary" : "";
    
    const backendBadge = p.gas_url 
      ? `<span class="bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-full px-2.5 py-0.5 text-[10px] font-bold">GAS Connected</span>`
      : `<span class="bg-gray-100 text-gray-700 border border-gray-300 rounded-full px-2.5 py-0.5 text-[10px] font-bold">Simulasi</span>`;

    const tr = document.createElement("tr");
    tr.className = `hover:bg-apple-parchment/50 transition-all cursor-pointer ${activeClass}`;
    tr.onclick = (e) => {
      // Don't change selected project if clicking button actions
      if (e.target.closest("button")) return;
      selectedProjectId = p.id;
      renderProjects();
      renderRoles();
    };

    tr.innerHTML = `
      <td class="py-4 px-5">
        <span class="font-bold text-apple-ink block text-xs sm:text-sm">${p.name}</span>
        <span class="text-[9px] text-apple-muted48">${p.id}</span>
      </td>
      <td class="py-4 px-5 font-bold text-apple-primary">${formatIDR(p.budget)}</td>
      <td class="py-4 px-5 text-apple-muted48">${formatDate(p.due_date)}</td>
      <td class="py-4 px-5">${backendBadge}</td>
      <td class="py-4 px-5 text-center">
        <div class="flex items-center justify-center gap-1.5 no-print">
          <button onclick="enterProject('${p.id}')" class="bg-gray-100 hover:bg-apple-primary hover:text-white text-apple-ink w-8 h-8 rounded-lg flex items-center justify-center transition-all" title="Masuk ke Workspace">
            <i class="fa-solid fa-right-to-bracket text-xs"></i>
          </button>
          <button onclick="editProject('${p.id}')" class="bg-gray-100 hover:bg-gray-200 text-apple-ink w-8 h-8 rounded-lg flex items-center justify-center transition-all" title="Edit Proyek">
            <i class="fa-solid fa-pencil text-xs"></i>
          </button>
          <button onclick="deleteProject('${p.id}')" class="bg-gray-100 hover:bg-red-50 hover:text-red-600 text-apple-ink w-8 h-8 rounded-lg flex items-center justify-center transition-all" title="Hapus Proyek">
            <i class="fa-regular fa-trash-can text-xs"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRoles() {
  const container = document.getElementById("roles-container");
  const addBtn = document.getElementById("btn-add-user");
  const p = projects.find(item => item.id === selectedProjectId);

  if (!p) {
    container.innerHTML = `
      <div class="text-center py-12 text-apple-muted48 text-xs">
        <i class="fa-solid fa-users text-lg mb-2 block text-apple-muted48/60"></i>
        Pilih salah satu proyek di Direktori sebelah kiri untuk mengonfigurasi peran pengguna.
      </div>
    `;
    addBtn.classList.add("hidden");
    document.getElementById("roles-title").innerText = "Peran: Silakan Pilih Proyek";
    return;
  }

  addBtn.classList.remove("hidden");
  document.getElementById("roles-title").innerText = `Peran: ${p.name}`;
  document.getElementById("roles-subtitle").innerText = `Mengelola kredensial dan hak akses untuk proyek ${p.id}.`;

  container.innerHTML = "";

  if (p.users.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-apple-muted48 text-xs">
        Belum ada pengguna terdaftar untuk proyek ini. Klik tombol '+' di atas untuk menambahkan peran baru.
      </div>
    `;
    return;
  }

  p.users.forEach(u => {
    // Style permission badges
    let permHtml = "";
    u.permissions.forEach(perm => {
      let badgeClass = "";
      if (perm === "Vendor") badgeClass = "border-blue-400 text-blue-600 bg-blue-50/20";
      else if (perm === "Budget") badgeClass = "border-purple-400 text-purple-600 bg-purple-50/20";
      else if (perm === "Milestone") badgeClass = "border-amber-400 text-amber-600 bg-amber-50/20";
      else if (perm === "Verify") badgeClass = "border-emerald-400 text-emerald-600 bg-emerald-50/20";
      
      permHtml += `<span class="border rounded-md px-2 py-0.5 text-[9px] font-semibold ${badgeClass}">${perm}</span>`;
    });

    const card = document.createElement("div");
    card.className = "bg-white p-4 rounded-xl border border-apple-hairline shadow-sm space-y-3 relative hover:scale-[1.01] transition-all";
    card.innerHTML = `
      <!-- User profile header -->
      <div class="flex justify-between items-start gap-4">
        <div>
          <h4 class="font-bold text-apple-ink text-sm">${u.label}</h4>
          <span class="text-[10px] text-apple-muted48 font-mono">${u.email}</span>
        </div>
        <div class="flex items-center gap-1">
          <button onclick="editUser('${u.email}')" class="text-gray-400 hover:text-apple-ink w-7 h-7 rounded-full bg-apple-parchment flex items-center justify-center transition-colors" title="Edit Peran">
            <i class="fa-solid fa-pencil text-[10px]"></i>
          </button>
          <button onclick="deleteUser('${u.email}')" class="text-gray-400 hover:text-red-500 w-7 h-7 rounded-full bg-apple-parchment flex items-center justify-center transition-colors" title="Hapus Peran">
            <i class="fa-regular fa-trash-can text-[10px]"></i>
          </button>
        </div>
      </div>

      <!-- Credentials -->
      <div class="flex items-center justify-between border-t border-apple-parchment pt-2 text-[10px] text-apple-muted48">
        <div>Token: <strong class="text-apple-ink font-mono text-xs">${u.token}</strong></div>
        <span class="bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wider">
          ${u.role}
        </span>
      </div>

      <!-- Permission lists -->
      <div class="flex flex-wrap gap-1.5 pt-1">
        ${permHtml}
      </div>
    `;
    container.appendChild(card);
  });
}

/* ==========================================================================
   PROJECT CRUD OPERATIONS
   ========================================================================== */
function openAddProjectModal() {
  editingProjectId = null;
  document.getElementById("project-form").reset();
  document.getElementById("project-modal-title").innerText = "Buat Proyek Baru";
  document.getElementById("project-modal").classList.remove("hidden");
}

function closeAddProjectModal() {
  document.getElementById("project-modal").classList.add("hidden");
  editingProjectId = null;
}

function submitProject(e) {
  e.preventDefault();

  const name = document.getElementById("form-project-name").value.trim();
  const budget = parseInt(document.getElementById("form-project-budget").value) || 0;
  const date = document.getElementById("form-project-date").value;
  const gas = document.getElementById("form-project-gas").value.trim();

  let projectToSync = null;

  if (editingProjectId) {
    // UPDATE
    const idx = projects.findIndex(p => p.id === editingProjectId);
    if (idx !== -1) {
      projects[idx].name = name;
      projects[idx].budget = budget;
      projects[idx].due_date = date;
      projects[idx].gas_url = gas;
      
      projectToSync = projects[idx];
      showToast("Proyek berhasil diperbarui!");
    }
  } else {
    // CREATE
    const newId = `WD-AURA-${Date.now().toString().slice(-3)}`;
    const newProject = {
      id: newId,
      name: name,
      budget: budget,
      due_date: date,
      gas_url: gas,
      users: [] // empty role list at start
    };
    projects.push(newProject);
    selectedProjectId = newId; // Select it
    projectToSync = newProject;
    showToast("Proyek baru berhasil dibuat!");
  }

  localStorage.setItem("AURA_PROJECTS", JSON.stringify(projects));
  calculateStats();
  renderProjects();
  renderRoles();
  closeAddProjectModal();

  // Sync with GAS
  if (projectToSync && projectToSync.gas_url) {
    syncProjectWithGAS(projectToSync.gas_url, "saveProject", projectToSync);
  }
}

function editProject(projectId) {
  const p = projects.find(item => item.id === projectId);
  if (!p) return;

  editingProjectId = projectId;
  
  document.getElementById("form-project-name").value = p.name;
  document.getElementById("form-project-budget").value = p.budget;
  document.getElementById("form-project-date").value = p.due_date;
  document.getElementById("form-project-gas").value = p.gas_url;

  document.getElementById("project-modal-title").innerText = "Edit Informasi Proyek";
  document.getElementById("project-modal").classList.remove("hidden");
}

function deleteProject(projectId) {
  const p = projects.find(item => item.id === projectId);
  const gas = p ? p.gas_url : null;

  showConfirm(
    "Hapus Proyek",
    "Apakah Anda yakin ingin menghapus proyek ini beserta seluruh data vendor, termin pembayaran, dan akun penggunanya?",
    () => {
      // Clearscoped local storages
      localStorage.removeItem(`AURA_VENDORS_DB_${projectId}`);
      localStorage.removeItem(`AURA_PAYMENTS_${projectId}`);
      localStorage.removeItem(`AURA_BUDGET_LIMIT_${projectId}`);

      projects = projects.filter(p => p.id !== projectId);
      localStorage.setItem("AURA_PROJECTS", JSON.stringify(projects));

      if (selectedProjectId === projectId) {
        selectedProjectId = projects.length > 0 ? projects[0].id : null;
      }

      calculateStats();
      renderProjects();
      renderRoles();
      showToast("Proyek berhasil dihapus.");

      // Sync with GAS
      if (gas) {
        syncProjectWithGAS(gas, "deleteProject", { id: projectId });
      }
    }
  );
}

function enterProject(projectId) {
  localStorage.setItem("AURA_ACTIVE_PROJECT_ID", projectId);
  window.location.href = "dashboard.html";
}

/* ==========================================================================
   USER ROLES CRUD OPERATIONS
   ========================================================================== */
function openAddUserModal() {
  editingUserEmail = null;
  document.getElementById("user-form").reset();
  
  // Uncheck permissions
  document.getElementById("perm-vendor").checked = false;
  document.getElementById("perm-budget").checked = false;
  document.getElementById("perm-milestone").checked = false;
  document.getElementById("perm-verify").checked = false;

  document.getElementById("user-modal-title").innerText = "Tambah Peran Baru";
  
  // Trigger autofill on load
  autoFillRoleDetails();
  
  document.getElementById("user-modal").classList.remove("hidden");
}

function closeAddUserModal() {
  document.getElementById("user-modal").classList.add("hidden");
  editingUserEmail = null;
}

function autoFillRoleDetails() {
  const roleCode = document.getElementById("form-user-role").value;
  const labelInput = document.getElementById("form-user-label");
  const emailInput = document.getElementById("form-user-email");
  const tokenInput = document.getElementById("form-user-token");

  // Checkbox inputs
  const pVendor = document.getElementById("perm-vendor");
  const pBudget = document.getElementById("perm-budget");
  const pMilestone = document.getElementById("perm-milestone");
  const pVerify = document.getElementById("perm-verify");

  if (roleCode === "CLIENT_DECIDER") {
    labelInput.value = "Decider";
    emailInput.placeholder = "contoh: tama@sg-corp.com";
    
    // Decider gets all permissions
    pVendor.checked = true;
    pBudget.checked = true;
    pMilestone.checked = true;
    pVerify.checked = true;
  } else if (roleCode === "CLIENT_INITIATOR") {
    labelInput.value = "Initiator";
    emailInput.placeholder = "contoh: indah@gmail.com";
    
    // Initiator gets Vendor only
    pVendor.checked = true;
    pBudget.checked = false;
    pMilestone.checked = false;
    pVerify.checked = false;
  } else {
    // Custom
    labelInput.value = "";
    emailInput.placeholder = "contoh: custom@domain.com";
    
    // Clear check
    pVendor.checked = false;
    pBudget.checked = false;
    pMilestone.checked = false;
    pVerify.checked = false;
  }
}

function submitUser(e) {
  e.preventDefault();

  const p = projects.find(item => item.id === selectedProjectId);
  if (!p) return;

  const email = document.getElementById("form-user-email").value.trim().toLowerCase();
  const role = document.getElementById("form-user-role").value;
  const label = document.getElementById("form-user-label").value.trim();
  const token = document.getElementById("form-user-token").value.trim();

  // Gather permissions
  const permissions = [];
  if (document.getElementById("perm-vendor").checked) permissions.push("Vendor");
  if (document.getElementById("perm-budget").checked) permissions.push("Budget");
  if (document.getElementById("perm-milestone").checked) permissions.push("Milestone");
  if (document.getElementById("perm-verify").checked) permissions.push("Verify");

  const userData = {
    email: email,
    role: role,
    label: label,
    token: token,
    permissions: permissions
  };

  if (editingUserEmail) {
    // UPDATE
    const idx = p.users.findIndex(u => u.email === editingUserEmail);
    if (idx !== -1) {
      p.users[idx] = userData;
      showToast("Peran anggota berhasil diperbarui!");
    }
  } else {
    // CREATE
    // Check duplication
    if (p.users.some(u => u.email === email)) {
      alert("Error: Email ini sudah terdaftar di dalam proyek!");
      return;
    }
    
    p.users.push(userData);
    showToast("Peran anggota baru berhasil didaftarkan!");
  }

  localStorage.setItem("AURA_PROJECTS", JSON.stringify(projects));
  calculateStats();
  renderRoles();
  closeAddUserModal();

  // Sync with GAS
  if (p.gas_url) {
    const payload = {
      projectId: p.id,
      email: userData.email,
      role: userData.role,
      label: userData.label,
      token: userData.token,
      permissions: userData.permissions
    };
    syncProjectWithGAS(p.gas_url, "saveUserRole", payload);
  }
}

function editUser(email) {
  const p = projects.find(item => item.id === selectedProjectId);
  if (!p) return;

  const u = p.users.find(item => item.email === email);
  if (!u) return;

  editingUserEmail = email;

  document.getElementById("form-user-email").value = u.email;
  document.getElementById("form-user-role").value = u.role;
  document.getElementById("form-user-label").value = u.label;
  document.getElementById("form-user-token").value = u.token;

  // Set Checkboxes
  document.getElementById("perm-vendor").checked = u.permissions.includes("Vendor");
  document.getElementById("perm-budget").checked = u.permissions.includes("Budget");
  document.getElementById("perm-milestone").checked = u.permissions.includes("Milestone");
  document.getElementById("perm-verify").checked = u.permissions.includes("Verify");

  document.getElementById("user-modal-title").innerText = "Edit Peran Pengguna";
  document.getElementById("user-modal").classList.remove("hidden");
}

function deleteUser(email) {
  showConfirm(
    "Hapus Peran",
    "Apakah Anda yakin ingin menghapus akun peran ini dari koordinasi proyek?",
    () => {
      const p = projects.find(item => item.id === selectedProjectId);
      if (!p) return;

      const gas = p.gas_url;

      p.users = p.users.filter(u => u.email !== email);
      localStorage.setItem("AURA_PROJECTS", JSON.stringify(projects));

      calculateStats();
      renderRoles();
      showToast("Peran berhasil dihapus.");

      // Sync with GAS
      if (gas) {
        syncProjectWithGAS(gas, "deleteUserRole", { projectId: p.id, email: email });
      }
    }
  );
}

/* ==========================================================================
   MODALS & CONFIRMS
   ========================================================================== */
function showToast(msg) {
  const t = document.getElementById("custom-toast");
  t.innerText = msg;
  t.style.opacity = "1";
  t.style.pointerEvents = "auto";
  
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.pointerEvents = "none";
  }, 3000);
}

function showConfirm(title, message, onOk) {
  const modal = document.getElementById("custom-confirm-modal");
  document.getElementById("confirm-title").innerText = title;
  document.getElementById("confirm-msg").innerText = message;
  
  modal.classList.remove("hidden");
  
  const btnOk = document.getElementById("btn-confirm-ok");
  const btnCancel = document.getElementById("btn-confirm-cancel");
  
  const cleanUp = () => {
    modal.classList.add("hidden");
    btnOk.onclick = null;
    btnCancel.onclick = null;
  };
  
  btnOk.onclick = () => {
    onOk();
    cleanUp();
  };
  
  btnCancel.onclick = () => {
    cleanUp();
  };
}

/* ==========================================================================
   UTILITIES
   ========================================================================== */
function formatIDR(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0
  }).format(num);
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/* ==========================================================================
   GAS SYNC UTILITY (Superadmin Sync Engine)
   ========================================================================== */
async function syncProjectWithGAS(url, action, payload) {
  if (!url) return;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: action,
        projectId: payload.projectId || payload.id || selectedProjectId || "WD-AURA-001",
        email: "admin@aura.com", // Superadmin
        data: payload
      })
    });
    const result = await response.json();
    if (result.success) {
      showToast("Database cloud berhasil diperbarui!");
    } else {
      showToast("Gagal cloud sync: " + result.message);
    }
  } catch (err) {
    console.error("Gagal sinkronisasi admin ke cloud:", err);
    showToast("Error sinkronisasi cloud: " + err.message);
  }
}
